# Nutrimind

A nutrition and meal-tracking app with a memory that actually learns. Instead of picking
items from a dropdown, you type what you ate — *"2 eggs, yogurt and a protein shake"* — and
the system maps it to foods it has learned before, scores its own confidence, and asks you
to confirm only when it is unsure.

**Live:** <https://nutri.emrullah.xyz>

---

## What makes it different

Most food trackers make you search a database. Nutrimind inverts that: you write naturally,
and the app builds a personal vocabulary of *aliases* as you go.

- **Free-text meal entry** — no search box, no autocomplete fight
- **Learned alias memory** — phrases you repeat become shortcuts to the exact food
  (including your own homemade recipes and specific brands)
- **Confidence-scored matching** — the system states how sure it is; low confidence
  triggers a confirmation step instead of a silent wrong entry
- **Camera input** — barcode scanning plus vision-based nutrition extraction from a photo
- **Reports** — daily, monthly, and yearly views with a health score and goal tracking
- **Installable** — PWA with an Android build via Capacitor
- **Trilingual** — Turkish, English, and Polish, with a build-time key-parity check

## Tech

| Layer | Choice |
|---|---|
| Client | React 18, TypeScript, Vite 6, Tailwind CSS |
| Server | **Zero npm dependencies** — `node:http` + `node:sqlite` (Node 22+) |
| Data | SQLite |
| AI | Provider-agnostic: Gemini, OpenRouter, OpenCode, Ollama Cloud — with health checks and automatic failover |
| i18n | i18next, 3 locales, verified parity in CI |
| Mobile | Capacitor (Android) |
| Monitoring | Sentry (client-side) |
| Testing | Vitest — **1,082 tests** across 76 files |

Roughly **39k lines** of application code (excluding tests), 221 source files.

The backend runs on Node's built-in HTTP and SQLite drivers rather than Express and
better-sqlite3. That choice removes an entire dependency surface and keeps the server
readable end to end, at the cost of writing routing and query handling by hand.

## Getting started

Requires **Node 22+** and **pnpm 10+**.

```bash
pnpm install

# terminal 1 — API on 127.0.0.1:8790
node server/index.js

# terminal 2 — Vite on 5173
pnpm dev
```

Two terminals are required: Vite proxies `/api` to the Node backend, so the client cannot
read data on its own.

For a production build, `pnpm preview` serves the compiled bundle on 4173 with the same
`/api` proxy — useful because behaviour that differs in dev (service worker registration,
double-invoked effects) only shows up in a real build.

```bash
cp .env.example .env    # add your API keys as needed
```

## Commands

```bash
pnpm dev         # dev server (5173) — backend runs separately
pnpm build       # tsc && vite build
pnpm preview     # serve the production build (4173)
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run
pnpm check:i18n  # verify locale key parity across tr/en/pl
pnpm format      # prettier --write .
```

## Architecture

```
src/
  components/   UI components
  pages/        DailyPage, HistoryPage, AliasPage, ...
  hooks/        useModalHistory, useModalExit, ...
  lib/          data.tsx (context), api.ts, ai.ts, nutrition.ts, ...
  i18n/         tr / en / pl locales
server/         Node API — HTTP, SQLite, auth, AI routing
docs/           documentation and archived notes
tasks/          working notes
```

**Data flow:** the client holds state in a React context (`src/lib/data.tsx`) and talks to
the server only through typed API calls (`src/lib/api.ts`). There is no global store
library — the app's state fits in a context, and adding Redux would be more ceremony than
the problem deserves.

**Auth:** email/password plus Google OAuth, with sessions stored in SQLite. Passwords are
hashed server-side; session identifiers are stored hashed rather than in plaintext.

**AI layer:** `server/ai.js` resolves a provider from configuration, checks its health,
and falls back to the next available one. Free-tier models are preferred automatically
when no paid key is configured, which keeps the app usable without any API keys at all.

## Notes

- `AGENTS.md` documents the architecture, conventions, and contribution rules in detail
  (written for both humans and AI agents).
- This project is released under a proprietary license — see [LICENSE](LICENSE) if present.
