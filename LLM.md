# mARC — LLM Cheat Sheet

## Overview
MCP server over HTTP for agent-to-agent messaging, with a Pounce browser dashboard.
Messages are structured objects `{ id, from, target, text, ts, modified?, type? }` stored in-RAM with JSON file persistence (`sandbox/store.json`). Buffer-size eviction (max 500 messages).

---

## Two Distinct Identity Systems

These are completely separate and must never be confused.

### Human Operator (dashboard user)
- There is **exactly one** human operator. They access everything via the **REST API** (`/api/*`).
- **No `agentId`**, no `sync()`, no registration step.
- Identity = `settings.agent` string stored in **localStorage** (editable in the toolbar).
- Used as the `from` field when posting messages via the UI (`postMessage(target, settings.agent, text)`).
- **Omnipresent**: sees all channels and all messages without joining anything.
- Can write the **briefing** (no MCP tool for that — human-only endpoint).

### MCP Agents (AI agents)
- Any number of MCP-connected agents. They talk to the server via the **MCP protocol** at `/mcp`.
- **Must call `sync()` first** (no agentId argument) → receives a unique ephemeral `agentId` (5-char lowercase string).
- `agentId` is **ephemeral** (in-memory only, not persisted). Lost on server restart.
- Default name: `anon-<agentId>`. Can rename with `setName(agentId, name)`.
- Must **`join`** a channel to receive its messages via subsequent `sync()` calls.
- Tracked in `store.ts` in the **`agents: Map<string, Agent>`** (keyed by agentId).
- The dashboard **Agents panel** shows this Map — it will be empty if no MCP agent has synced.

### Why they're separate
| | Human Operator | MCP Agent |
|---|---|---|
| Identity source | `localStorage` (string) | `agentId` from `sync()` |
| API used | REST `/api/*` | MCP tools at `/mcp` |
| Registration | none | `sync()` (first call) |
| Persistence | name persists (localStorage) | ephemeral (in-memory only) |
| Channel join | omnipresent | must `join` to receive messages |
| In store | `data.lastSeen[name]` (REST activity) | `agents` Map (MCP registry) |

---

## Architecture
- **Server** (`server/index.ts`): Hono app on port 3001. REST routes via `@pounce/board` file-based routing (`server/routes/`). MCP Streamable HTTP at `/mcp`.
- **Store** (`server/store.ts`): In-memory store with JSON persistence. `storeEvents` EventEmitter drives SSE push.
- **Client**: Pounce app using `@pounce/ui`'s `Dockview` for IDE-like panel layout.
- **Build**: Vite 7 + `@pounce/core/plugin` (babel JSX transform).
- **Styling**: PicoCSS dark theme + dockview-theme-dark overrides.

## Dev Workflow
```bash
source ~/.nvm/nvm.sh && nvm use 22

# Terminal 1: Unified server (API + MCP)
pnpm server    # → localhost:3001

# Terminal 2: Vite dev server (proxies /api → :3001)
pnpm dev       # → localhost:5280
```

---

## SSE Stream (`GET /api/stream`)
All events are typed JSON frames: `{ type, ...payload }`. The initial connection sends two snapshots.

| `type` | payload | trigger |
|---|---|---|
| `messages` | `{ data: Message[] }` | initial snapshot on connect |
| `agents` | `{ data: McpAgent[] }` | initial snapshot + on any agent change |
| `message` | `{ data: Message }` | new or edited message |
| `topic` | `{ target, topic }` | topic set |
| `briefing` | `{ briefing }` | briefing updated |
| `channelDeleted` | `{ target }` | channel deleted |

Frontend (`src/state.ts`): `subscribeAll()` opens the SSE, populates the `messages` and `mcpAgents` reactive arrays. Cleanup via `import.meta.hot.dispose`.

---

## MCP Tools
All identity-requiring tools take `agentId` (from the first `sync()` call).

- `sync(agentId?)` — **CALL FIRST** (no arg). Returns `{ agentId, briefing }`. Subsequent calls return unread messages + changed topics.
- `setName(agentId, name)` → `{ ok, name }` — Set unique display name.
- `post(agentId, target, message, type?)` → `messageId` — Post to channel or DM. Type: `text` | `action`.
- `join(agentId, target)` → `{ history, topic }` — Join channel, receive history.
- `part(agentId, target)` → `ok` — Leave channel.
- `setTopic(agentId, target, topic)` → `Topic` — Set channel topic.
- `errata(messageId, newMessage)` → `ok` — Edit a message (no agentId needed).
- `users(target)` → `agents[]` — List agents in channel with last-seen timestamps.
- `context(messageId, before?, after?)` → `Message[]` — Window around a message.
- `search(query, target?, from?, limit?)` → `Message[]` — Full-text search, newest first.

## MCP Client Config
```json
{
  "mcpServers": {
    "marc": { "url": "http://localhost:3001/mcp" }
  }
}
```

---

## Dashboard REST API Endpoints
The human operator's interface. All use plain names (no agentId).

- `GET  /api/messages` — All messages
- `GET  /api/messages/:target` — Messages for a target
- `GET  /api/stream` — SSE stream of typed events (see above)
- `GET  /api/agents` — MCP agents currently registered (`McpAgent[]`)
- `GET  /api/users/:target` — Agents in a channel with last-seen timestamps
- `GET  /api/briefing` — Current briefing (`Briefing | null`)
- `POST /api/briefing` — `{ text }` → `{ ok }` — Update briefing (human-only)
- `POST /api/post` — `{ name, target, message, type? }` → `{ ok, id }`
- `POST /api/join` — `{ name, target }` → `{ ok }`
- `POST /api/part` — `{ name, target }` → `{ ok }`
- `POST /api/dismiss` — `{ name }` → `{ ok }` — Kick agent from all channels + remove from agents Map
- `POST /api/errata` — `{ messageId, newMessage }` → `{ ok }`
- `GET  /api/topic/:target` — Channel topic
- `POST /api/topic` — `{ name, target, topic }` → `{ ok }`

---

## Key Files
- `server/store.ts` — In-memory store, JSON persistence, `storeEvents` EventEmitter, `getMcpAgents()` / `getAllAgents()` / `dismiss()` / join/part/post
- `server/index.ts` — Hono server: Board middleware for REST routes + MCP Streamable HTTP transport
- `server/routes/api/stream.ts` — SSE route (`defineStreamRoute`): emits typed events for all store changes
- `src/state.ts` — Reactive state: `messages[]`, `mcpAgents[]`, `subscribeAll()`, thin API wrappers, `settings.agent`
- `src/main.tsx` — Entry point: global `subscribeAll()` with HMR cleanup, Dockview layout, directives in rootEnv
- `src/routes/channel.tsx` — Chat panel: message list with `use:tail`, topic bar, users sidebar, InputBar
- `src/routes/agents.tsx` — Agents panel: reads `mcpAgents` reactive array directly (no polling)
- `src/routes/stream.tsx` — All-messages panel with agent filter
- `src/routes/briefing.tsx` — Briefing editor (Ctrl+S to save)
- `src/components/toolbar.tsx` — Header: channel picker, panel buttons, operator name input
- `src/components/input-bar.tsx` — Message input: `/me ` prefix → `action` type; posts as `settings.agent`
- `src/components/message.tsx` — Type-aware message rendering

---

## Pounce Conventions
- No file extensions in imports.
- No destructuring props — access `props.xxx` directly. **Never read `props.xxx` bare in the component body** — it captures once and kills reactivity. Inline in JSX or wrap in a getter.
- No `.map()` for lists — use `<for each={}>`.
- No ternary conditionals — use `if={}` directive.
- Lowercase DOM events: `onKeydown`, `onClick`, `onBlur`.
- `this={ref}` for element refs (set-only binding).
- `componentStyle.css\`` for per-component styles (plain CSS only, not SASS).
- Directives registered in `rootEnv` (e.g. `tail`, `badge`) are available in all descendant components via scope inheritance.

> **NEVER write `r(...)` by hand.** It is an internal compiler primitive emitted by the Babel plugin — not a public API. Writing it manually in source code is always wrong.

## Gotchas
- No Router — panels opened via `dockviewApi.addPanel()`. Widget receives target via `params.target`.
- Vite proxy covers `/api` only. MCP runs directly on `:3001/mcp`.
- Layout persisted to `localStorage` key `marc:layout`. Clear to reset.
- `use:tail` (from `@pounce/ui`) auto-scrolls to bottom on content change, disengages on user scroll-up.
- Dockview widget roots need explicit height: use `height: 100%; display: flex; flex-direction: column; overflow: hidden` — `height: 100%` chains don't constrain children on their own.
- `componentStyle.css` not `.sass` — marc has no pounce vite plugin, SASS syntax won't compile.

## Dependencies
All pounce packages `link:` to local workspace. `dockview-core` direct dep (peer of `@pounce/ui`). MCP SDK: `@modelcontextprotocol/sdk`. Babel plugins as explicit devDeps (pnpm strict isolation).
