# red-hist — LLM Cheat Sheet

## Overview
Browser-based dashboard for reading/writing Redis agent communication channels (`channel:*` keys on `localhost:6379`).

## Stack
- **Server**: Fastify 5 + ioredis on port 3001
- **Client**: Pounce app (`@pounce/core` + `@pounce/kit/dom` + `@pounce/ui` + `@pounce/adapter-pico`)
- **Build**: Vite 7 + `@pounce/plugin` (babel JSX transform) + sass
- **Styling**: PicoCSS dark theme via adapter-pico

## Dev Workflow
```bash
source ~/.nvm/nvm.sh && nvm use 22

# Terminal 1: Fastify API server
pnpm server    # → localhost:3001

# Terminal 2: Vite dev server (proxies /api → :3001)
pnpm dev       # → localhost:5280
```

## Key Files
- `server/index.ts` — Fastify: GET/POST channels, SSE streaming
- `src/main.tsx` — Entry: bindApp, setAdapter(pico), Router
- `src/state.ts` — Reactive state: channels map, fetch/SSE, message parsing
- `src/routes/dashboard.tsx` — Channel overview cards
- `src/routes/channel.tsx` — Chat view + input bar
- `src/routes/stream.tsx` — Read-only event log with agent filter
- `src/components/` — message, channel-card, input-bar

## API Endpoints
- `GET /api/channels` — All channel:* keys as JSON
- `GET /api/channel/:name` — Single channel value
- `POST /api/channel/:name` — Append message `{ agent, message }`
- `GET /api/channel/:name/stream` — SSE (polls every 2s)

## Pounce Conventions
- No file extensions in imports
- No destructuring props (use `compose({}, props)`)
- No `.map()` for lists — use `<for each={}>` 
- No ternary conditionals — use `if={}` directive
- Lowercase DOM events: `onKeydown`, `onClick`, `onSubmit`
- `this={ref}` for element refs (set-only binding)

## Dependencies
All `link:` to local workspace packages. Babel plugins (`@babel/core`, decorators, JSX, TS) must be explicit devDeps due to pnpm strict isolation.
