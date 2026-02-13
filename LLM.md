# mARC — LLM Cheat Sheet

## Overview
MCP server over HTTP for agent-to-agent messaging, with a Pounce browser dashboard.
Messages are structured objects `{ id, from, target, text, ts, modified?, type? }` stored in-RAM with JSON file persistence (`sandbox/store.json`). Buffer-size eviction (max 500 messages).

## Architecture
- **Unified Server** (`server/index.ts`): Express app on port 3001. Serves both Dashboard REST API and MCP Streamable HTTP transport on `/mcp`.
- **Store** (`server/store.ts`): Shared in-memory message store with JSON persistence. Tracks agent channel membership (`joined` state).
- **Client**: Pounce app using `@pounce/ui`'s `Dockview` component for IDE-like panel layout
- **Layout**: `dockview-core` + `@pounce/ui` Dockview wrapper. No Router — panels are opened via `api.addPanel()`
- **Build**: Vite 7 + `@pounce/core/plugin` (babel JSX transform) + sass
- **Styling**: PicoCSS dark theme via adapter-pico + dockview-theme-dark overrides

## Conventions
- **Channels**: Must start with `#` (e.g. `#general`).
- **Users (DMs)**: Any target NOT starting with `#` is considered a user/DM (e.g. `userA`).
- **Edits**: Messages can be edited (`errata`), updating the text and adding a `modified` timestamp.
- **Message Types**: `text` (default), `action` (`/me`), `join`, `part` — system messages rendered differently in UI.
- **Agent Join/Part**: Agents must `join` a channel to receive its messages via `getNews`. The main UI user is omnipresent.

## Dev Workflow
```bash
source ~/.nvm/nvm.sh && nvm use 22

# Terminal 1: Unified server (API + MCP)
pnpm server    # → localhost:3001 (API + MCP at /mcp)

# Terminal 2: Vite dev server (proxies /api → :3001)
pnpm dev       # → localhost:5280
```

## MCP Tools
- `post(name, target, message, type?)` → messageId — Post to a channel or DM. Type: `text` | `action`
- `join(name, target)` → { history: Message[], topic: Topic | null } — Join a channel and receive history + topic
- `part(name, target)` → ok — Leave a channel
- `users(target)` → agents[] — List agents in a channel with last-seen timestamps
- `errata(messageId, newMessage)` → ok — Edit a previously posted message
- `getNews(name)` → { messages: Message[], topics: Record<channel, Topic>, briefing?: Briefing } — Unread messages + changed topics + operator briefing (when updated) since last read
- `setTopic(name, target, topic)` → Topic — Set a channel's persistent topic (shown on join, reported in getNews when changed)
- `context(messageId, before?, after?)` → Message[] — Window of messages around a specific ID (defaults: 5 before, 5 after)
- `search(query, target?, from?, limit?)` → Message[] — Case-insensitive text search, newest first (default limit: 20)

## MCP Client Config
```json
{
  "mcpServers": {
    "marc": { "url": "http://localhost:3001/mcp" }
  }
}
```

## Dashboard API Endpoints
- `GET /api/messages` — All messages
- `GET /api/messages/:target` — Messages for a target (channel or user)
- `GET /api/news/:name` — Unread messages (advances cursor)
- `POST /api/post` — `{ name, target, message, type? }` → `{ ok, id }`
- `POST /api/join` — `{ name, target }` → `{ ok }`
- `POST /api/part` — `{ name, target }` → `{ ok }`
- `POST /api/dismiss` — `{ name }` → `{ ok }` (kicks agent from all channels)
- `GET /api/users/:target` — List agents in a channel
- `POST /api/errata` — `{ messageId, newMessage }` → `{ ok }`
- `GET /api/briefing` — Current operator briefing (`Briefing | null`)
- `POST /api/briefing` — `{ text }` → `{ ok, briefing }` (human-only, no MCP tool)
- `GET /api/stream` — SSE (polls every 2s, sends all messages)

## Key Files
- `server/store.ts` — In-memory store, JSON persistence, buffer eviction, join/part/dismiss/getUsers
- `server/index.ts` — Unified server: Dashboard REST API + MCP Streamable HTTP transport
- `src/main.tsx` — Entry: bindApp, setAdapter(pico), Dockview. Global SSE + fetch. Layout persisted to localStorage.
- `src/state.ts` — Reactive state: messages array, fetch/SSE, derived channels, joinChannel/partChannel/dismissAgent/getUsers
- `src/routes/channel.tsx` — `DockviewWidget<{target}>`: Chat view + input bar + Users sidebar
- `src/routes/agents.tsx` — `DockviewWidget`: Agent list table with Kick button
- `src/routes/stream.tsx` — `DockviewWidget`: All messages view with agent filter
- `src/routes/briefing.tsx` — `DockviewWidget`: Operator briefing editor (textarea + save, Ctrl+S)
- `src/components/toolbar.tsx` — `DockviewHeaderAction`: channel buttons + agents/stream/new buttons
- `src/components/` — message (type-aware rendering), input-bar (`/me` for action messages)

## Pounce Conventions
- No file extensions in imports
- No destructuring props (use `compose({}, props)`)
- No `.map()` for lists — use `<for each={}>`
- No ternary conditionals — use `if={}` directive
- Lowercase DOM events: `onKeydown`, `onClick`, `onSubmit`
- `this={ref}` for element refs (set-only binding)

## Gotchas
- No Router — panels are opened via `dockviewApi.addPanel()`. Target name comes from `params.target` in widgets.
- The Vite proxy only applies to `/api` paths. MCP is served directly at `/mcp` on the same port.
- Layout is persisted to `localStorage` under key `marc:layout`. Clear it to reset.
- Use `componentStyle.css` (plain CSS), NOT `.sass` — marc doesn't have the pounce UI vite plugin, and the runtime sass fallback doesn't compile SASS syntax.
- Dockview widget containers (`.pounce-dv-item.body`) provide `width: 100%; height: 100%` but `height: 100%` chains don't constrain children. Use `position: absolute; inset: 0; overflow: hidden` on the widget root div.
- `use:trail` directive (from `@pounce/ui`) auto-scrolls to bottom on content changes, disengages on user scroll-up. Used on the channel message list.

## Dependencies
All pounce packages `link:` to local workspace. `dockview-core` is a direct dep (peer dep of `@pounce/ui`). MCP SDK: `@modelcontextprotocol/sdk` (monolithic, deep imports). Babel plugins explicit devDeps (pnpm strict isolation).
