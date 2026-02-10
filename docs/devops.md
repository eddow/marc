# DevOps — Redis Agent Bus & MCP Integration

Setting up the Redis agent bus and MCP integration from scratch.

## 1. Redis Server Installation

```bash
sudo apt install redis-server
```

- **Version**: Redis 7.0.15
- **Runs as**: systemd service (`redis-server.service`), auto-starts on boot
- **Bind**: `localhost:6379` (default, no auth)
- **Verify**: `redis-cli ping` → `PONG`

No configuration changes were needed — the default `redis.conf` is fine for local dev.

## 2. MCP Server: `red-irc`

The bridge between Windsurf agents and Redis is an **MCP server** (Model Context Protocol). We use the official Python-based `redis-mcp` package, run via `uvx` (no manual install needed).

### Windsurf MCP Configuration

In Windsurf's MCP settings (`~/.codeium/windsurf/mcp_config.json` or equivalent):

```json
{
  "mcpServers": {
    "red-irc": {
      "command": "uvx",
      "args": ["redis-mcp"],
      "env": {
        "REDIS_HOST": "localhost",
        "REDIS_PORT": "6379"
      }
    }
  }
}
```

- **Name**: `red-irc` — all tool calls are prefixed `mcp1_*`
- **No reboot needed** — Windsurf picks up new MCP servers on config save (indicator turns green)
- **`uvx`** resolves and runs `redis-mcp` from PyPI on the fly; no virtualenv management

### Available Tools

| Tool | Purpose |
|------|---------|
| `mcp1_get(key)` | Read a single key |
| `mcp1_set(key, value)` | Write a single key |
| `mcp1_mget(keys[])` | Read multiple keys at once |
| `mcp1_mset(mapping{})` | Write multiple keys at once |
| `mcp1_list(pattern)` | List keys matching glob pattern |
| `mcp1_scan(pattern, count, cursor)` | Paginated key scan |
| `mcp1_delete(keys)` | Delete one or more keys |

## 3. Channel Architecture

Agents communicate through **5 Redis string keys**. Each key holds a plain-text log — messages are appended with newlines.

| Key | Purpose | Write Policy |
|-----|---------|-------------|
| `channel:handoff` | Session handoff notes ("last will and testament") | Overwrite OK |
| `channel:alerts` | High-priority requests | Append |
| `channel:general` | Status updates, milestones, discussions | Append |
| `channel:debug` | Error dumps, compiler output, technical logs | Append |
| `channel:stream` | Immutable event log | **Append-only — never overwrite** |

### Message Format

```
[YYYY-MM-DD HH:MM] [Agent-Name]: <Message Content>
```

Examples:
```
[2026-02-10 09:55] [Goldberg]: Implemented both analyses. Array length refactored to metaProtos. 646 passed, 0 failures.
[2026-02-10 11:11] [pico-tee]: Pico demo /display route fully styled. 48/48 tests.
[2026-02-10 11:12] [devops]: Infrastructure milestone — Redis agent bus LIVE.
```

### Append Protocol

Agents must **never overwrite** existing content. The correct pattern:

```
1. value = mcp1_get("channel:general")
2. value += "\n[timestamp] [agent]: message"
3. mcp1_set("channel:general", value)
```

This is enforced by convention (AGENTS.md), not by Redis itself. The `red-hist` server's `POST /api/channel/:name` endpoint implements this atomically.

## 4. Seeding Channels

On a fresh install, the 5 channel keys won't exist yet. Seed them with initial content:

```bash
redis-cli SET channel:handoff ""
redis-cli SET channel:alerts ""
redis-cli SET channel:general "[$(date '+%Y-%m-%d %H:%M')] [system]: Redis agent bus initialized."
redis-cli SET channel:debug ""
redis-cli SET channel:stream "[$(date '+%Y-%m-%d %H:%M')] [system]: Channel stream created."
```

Or let the first agent session populate them — any `mcp1_set` call creates the key if it doesn't exist.

## 5. Agent Protocol (from AGENTS.md)

Every agent session follows these rules:

1. **Read first**: `mcp1_mget(["channel:handoff", "channel:alerts", "channel:stream"])` on session start
2. **Append, don't overwrite**: Read → concat → write
3. **State persistence**: Agent memory resets each session — Redis is "external RAM"
4. **Follow up**: Check ongoing discussions before starting new work
5. **Stream is sacred**: `channel:stream` is the immutable event log — never delete lines

## 6. Why red-hist

Redis CLI can read/write channels, but:
- No overview of all channels at a glance
- No message parsing (timestamps, agent names, content)
- No live updates
- No way for a human to post messages without knowing the append protocol
- No filtering or search

**red-hist** is the human interface to the agent bus. It:
- Shows all channels as cards with last-message previews
- Parses messages into structured chat views with color-coded agents
- Streams updates via SSE (server polls Redis every 2s)
- Lets humans post messages (as `[human]` agent) with automatic formatting
- Treats `channel:stream` as read-only (no input bar)

It's also the **first real pounce application** — dogfooding `@pounce/core`, `@pounce/kit`, `@pounce/ui`, and `@pounce/adapter-pico` from their local workspace builds.

## 7. Troubleshooting

### Redis not running
```bash
sudo systemctl start redis-server
redis-cli ping  # should return PONG
```

### MCP server not green in Windsurf
- Check that `uvx` is on PATH (installed via `pipx` or system Python)
- Verify config JSON syntax
- Restart Windsurf if config was added while it was running (usually not needed)

### Channels empty
See **§4 Seeding Channels** above. Alternatively, just start posting — `POST /api/channel/:name` creates the key on first write.

### red-hist can't reach Redis
The Fastify server (`server/index.ts`) connects to `localhost:6379`. If Redis is on a different host/port, set `REDIS_URL` env var before starting the server.
