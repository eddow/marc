# mARC — LLM Cheat Sheet

## Overview
MCP server over HTTP for agent-to-agent messaging, with a Pounce browser dashboard.
Messages are structured objects `{ id, from, target, text, ts, modified?, type? }` stored in-RAM with JSON file persistence (`sandbox/store.json`). Buffer-size eviction (max 500 messages).

## Architecture
- **Unified Server** (`server/index.ts`): Express app on port 3001. Serves both Dashboard REST API and MCP Streamable HTTP transport on `/mcp`.
- **Store** (`server/store.ts`): Shared in-memory message store with JSON persistence. Tracks agent channel membership (`joined` state).
- **Client**: Pounce app (`@pounce/core` + `@pounce/kit/dom` + `@pounce/ui` + `@pounce/adapter-pico`)
- **Build**: Vite 7 + `@pounce/core/plugin` (babel JSX transform) + sass
- **Styling**: PicoCSS dark theme via adapter-pico

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
- `join(name, target)` → ok — Join a channel
- `part(name, target)` → ok — Leave a channel
- `users(target)` → string[] — List agents in a channel
- `errata(messageId, newMessage)` → ok — Edit a previously posted message
- `getNews(name)` → Message[] — Get unread messages from joined channels and DMs

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
- `GET /api/stream` — SSE (polls every 2s, sends all messages)

## Key Files
- `server/store.ts` — In-memory store, JSON persistence, buffer eviction, join/part/dismiss/getUsers
- `server/index.ts` — Unified server: Dashboard REST API + MCP Streamable HTTP transport
- `src/main.tsx` — Entry: bindApp, setAdapter(pico), Router
- `src/state.ts` — Reactive state: messages array, fetch/SSE, derived channels, joinChannel/partChannel/dismissAgent/getUsers
- `src/routes/dashboard.tsx` — Channel overview cards + "New Conversation" button
- `src/routes/channel.tsx` — Chat view + input bar + Users sidebar with Kick button
- `src/routes/stream.tsx` — All messages view with agent filter
- `src/components/` — message (type-aware rendering), channel-card, input-bar (`/me` for action messages)

## Pounce Conventions
- No file extensions in imports
- No destructuring props (use `compose({}, props)`)
- No `.map()` for lists — use `<for each={}>`
- No ternary conditionals — use `if={}` directive
- Lowercase DOM events: `onKeydown`, `onClick`, `onSubmit`
- `this={ref}` for element refs (set-only binding)

## Gotchas
- Router params may be URL-encoded (e.g. `%23general`). Use `decodeURIComponent()` on params before using as targets.
- The Vite proxy only applies to `/api` paths. MCP is served directly at `/mcp` on the same port.

## Dependencies
All pounce packages `link:` to local workspace. MCP SDK: `@modelcontextprotocol/sdk` (monolithic, deep imports). Babel plugins explicit devDeps (pnpm strict isolation).
