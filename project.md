# red-hist — Agent Chat Dashboard

The first real **pounce** application. A browser-based dashboard for reading and writing to the Redis agent communication channels.

## Purpose

Provide a web UI to monitor and participate in the agent-to-agent (a2a) communication happening on Redis (`localhost:6379`). Channels are simple string keys (`channel:handoff`, `channel:alerts`, `channel:general`, `channel:debug`, `channel:stream`).

## Architecture

### Server (minimal)

A tiny **Fastify** server (~50 lines) that:

1. **`GET /api/channels`** — Returns all `channel:*` keys and their values as JSON.
2. **`GET /api/channel/:name`** — Returns the value of a single channel key.
3. **`POST /api/channel/:name`** — Appends a message to a channel (read → concat → write). Body: `{ "agent": "human", "message": "..." }`. The server formats it as `[YYYY-MM-DD HH:MM] [agent]: message` and appends.
4. **`GET /api/channel/:name/stream`** — SSE endpoint that polls the channel every 2s and pushes diffs to the client (for live updates without full page refresh).

Uses `ioredis` to talk to `localhost:6379`.

### Client (pounce app)

A **pounce** application using:
- `@pounce/core` — JSX, reactivity, `bindApp()`
- `@pounce/kit` — `Router`, `<A>`, `client`, `css`/`sass`
- `@pounce/ui` — UI components, `DisplayProvider`, `ThemeToggle`
- `@pounce/adapter-pico` + `@picocss/pico` — PicoCSS for styling (lightweight, looks good out of the box)
- `mutts` — reactive state

#### Views

1. **Dashboard** (`/`) — Overview of all channels. Each channel shown as a card with:
   - Channel name + badge with message count
   - Last message preview
   - Click → navigates to channel detail

2. **Channel Detail** (`/channel/:name`) — Full chat view:
   - Scrollable message list, each message parsed into `[timestamp] [agent]: content`
   - Color-coded agent names (consistent hash → hue)
   - Auto-scroll to bottom on new messages (SSE-driven)
   - **Input bar** at the bottom: text area + send button. Posts as `[human]` agent.
   - Markdown rendering for message content (code blocks, bold, etc.) — optional, can be plain text initially

3. **Stream** (`/stream`) — Special view for `channel:stream` (append-only log):
   - Reverse-chronological or chronological toggle
   - Filter by agent name
   - Read-only (no input bar — stream is system-managed)

#### Reactive Data Flow

```
Redis ←→ Fastify API ←→ fetch/SSE ←→ mutts reactive state ←→ pounce components
```

- `channels` — `reactive({})` map of channel name → content string
- `effect()` or `attend()` to auto-fetch on interval or SSE
- Router reads `client.url` for navigation
- Input bar calls `POST /api/channel/:name` then refreshes

### Dependencies

See `package.json` for the full list. Key points:

- All pounce packages use `link:` to local workspace (dogfooding dist output)
- Build plugin: `@pounce/core/plugin` (Babel transform for JSX reactivity) — no separate `@pounce/plugin`
- Babel deps as devDeps (required by the core plugin at build time)
- `ioredis` for the Fastify server's Redis connection

### File Structure

```
red-hist/
├── project.md          # This file
├── package.json
├── tsconfig.json
├── LLM.md              # LLM cheat-sheet
├── vite.config.ts      # Vite + @pounce/core/plugin + proxy /api → fastify
├── server/
│   └── index.ts        # Fastify server (Redis ↔ HTTP bridge)
├── src/
│   ├── main.tsx        # Entry point: bindApp(), setAdapter(pico), Router
│   ├── state.ts        # Reactive state: channels map, fetch/SSE logic
│   ├── routes/
│   │   ├── dashboard.tsx   # Channel overview cards
│   │   ├── channel.tsx     # Single channel chat view + input
│   │   └── stream.tsx      # Stream log viewer
│   ├── components/
│   │   ├── message.tsx     # Single parsed message (timestamp, agent badge, content)
│   │   ├── channel-card.tsx # Dashboard card for a channel
│   │   └── input-bar.tsx   # Message input + send
│   └── styles/
│       └── app.sass        # App-specific styles (agent colors, chat layout)
├── docs/
│   └── devops.md       # Deployment notes
├── index.html          # Vite entry HTML
└── sandbox/            # Temp files
```

### Dev Workflow

```bash
# Terminal 1: Fastify server
node --import tsx server/index.ts

# Terminal 2: Vite dev server (proxies /api to Fastify)
pnpm dev
```

Or combine via Vite's `server.proxy` config pointing `/api` → `http://localhost:3001`.

### Key Decisions

1. **Link dependencies** — Use `link:` to consume pounce packages from their local dist. This dogfoods the real published package experience.
2. **PicoCSS** — Minimal CSS framework, already has an adapter. Perfect for a utility app.
3. **SSE for live updates** — Simpler than WebSockets, sufficient for polling Redis string keys.
4. **`channel:stream` is read-only** — The UI enforces append-only semantics by not providing a write input for the stream channel.
5. **Agent name `human`** — Messages posted from the UI use `[human]` as the agent name.

### Stretch Goals

- [ ] Redis MONITOR mode — show raw Redis commands in a debug panel
- [ ] Channel archiving — button to snapshot a channel to a timestamped key
- [ ] Agent activity timeline — visual timeline of stream events
- [ ] Syntax highlighting for code blocks in messages
- [ ] Dark mode toggle — `DisplayProvider` + `ThemeToggle` from `@pounce/ui` are ready, just need wiring
