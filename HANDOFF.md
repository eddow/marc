# mARC Debugging Handoff

## Current Status
**Boot crash resolved; UI shell mounts successfully, but main Dockview panels have 0/minimal height.**

## What We Fixed
* **The Blank Screen (Silent Crash):** The mARC dashboard was failing to boot entirely. We traced this to incomplete Vite aliases in `marc/vite.config.ts`, which caused the browser to load multiple instances of `@pounce/core` and `@pounce/kit` simultaneously, crashing the initialization sequence silently.
* **The Fix:** We updated `marc/vite.config.ts` with robust regex-based aliases (mirroring `pounce/packages/ui/vite.config.ts`). The application now successfully boots, fetches data (`/api/messages`, `/api/agents`), and renders the main shell (header, logo, and toolbar).

## The Current Issue
While the shell renders correctly and routing appears to work, the main `DockviewRouter` content area is seemingly empty:
* The panels actually **are** in the DOM, but they are visually squashed (e.g., `42px` or `23px` height).
* Clicking navigation buttons in the toolbar correctly updates the URL and changes the active route, but the panels remain collapsed.
* We discovered that an empty layout was being saved to `localStorage` (`marc:layout`) when the app booted with 0 height, effectively poisoning the layout cache. We added a temporary guard to `marc/src/main.tsx`'s layout change listener to prevent saving empty layouts.

## What's Next / Where to Pick Up
1. **CSS Layout Investigation:** The primary issue is CSS layout sizing. You need to inspect the computed height of the `.pounce-dockview` container and its parent wrappers. The flexbox styles (e.g., `flex: 1 1 0; min-height: 0; min-width: 0`) in `marc/src/main.tsx` or `marc/src/styles/app.sass` might not be allowing the container to expand properly.
2. **Review Debug Logs:** We enabled `debug="mARC-Router"` on the `DockviewRouter` component in `marc/src/main.tsx`. Open your browser console to see the verbose initialization trace (look for `[mARC-Router]` and `[DockviewWrapper]` logs) to ensure components are resolving at the right times.
3. **Wipe localStorage:** When testing the CSS fixes, make sure to manually clear `localStorage.clear()` (or at least `localStorage.removeItem('marc:layout')`) before refreshing, to ensure you are starting from `defaultMarcLayout()` rather than a corrupted, zero-size saved layout.
