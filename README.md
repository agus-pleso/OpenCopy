# OpenCopy

Open-source, self-hostable AI copywriting platform built around **agentic copywriter and localizer agents that follow your brand voice**.

> Status: **V0.1** — scaffold, auth, workspace data model, OpenRouter integration, app shell.

## What it does (V1.0 target)

- **Brand Voice** — extract a structured voice profile from your existing copy: tone descriptors, do's and don'ts, audience, reading level, required and forbidden words. Voice is the spine; every agent reads from it.
- **Copywriter Agent** — multi-agent flow (planner → parallel drafters → voice auditor → refiner) that produces multiple on-brand variants for any brief.
- **Localizer Agent** — transcreation flow (cultural adapter → localizer → back-translator → voice auditor) that adapts copy to a target locale while staying on-brand. Supported locales: **EN, PL, RO, UA**.
- **Live agent timeline** — every step of every run is visible. No black box.

## Stack

- Next.js 15 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Geist
- Postgres + Drizzle ORM
- Auth.js v5 (magic-link + dev credentials)
- Vercel AI SDK + OpenRouter (use any model: Claude, GPT, Gemini, Llama, Mistral, etc.)
- MIT licensed

The AI gateway is abstracted — you can swap OpenRouter for direct provider keys or a local Ollama instance without changing application code.

## Quickstart (development)

### 1. Clone and install
```bash
pnpm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env. Generate AUTH_SECRET and ENCRYPTION_KEY:
#   openssl rand -base64 32
```

### 3. Start Postgres

**Option A — Docker (recommended):**
```bash
docker compose up -d postgres
```

**Option B — Hosted (Neon / Supabase free tier):**
Create a Postgres database, copy the pooled connection string into `DATABASE_URL` in `.env`.

**Option C — Local install:** Postgres 16+ running on localhost; create a `opencopy` database.

### 4. Run migrations
```bash
pnpm db:generate   # generate SQL from schema (only after schema changes)
pnpm db:migrate    # apply migrations
```

### 5. Start the app
```bash
pnpm dev
```
Open http://localhost:3000. With `DEV_AUTH_ENABLED=true` you can sign in instantly with any email + any password (dev only).

### 6. Add your OpenRouter key
After signing in, visit **Settings → AI Providers** and paste your [OpenRouter](https://openrouter.ai/) key. Pick default models for each role (planning, drafting, fast, critic).

## Self-host (production)

A `docker-compose.yml` is provided that runs the app and Postgres together:
```bash
docker compose up -d
```

For real deployments, set `AUTH_SECRET`, `ENCRYPTION_KEY`, and `DATABASE_URL` to production values, configure email sending (Resend or SMTP), and put a reverse proxy in front (Caddy, Traefik, nginx).

## Roadmap

| Version | Theme |
|---------|-------|
| V0.1    | Foundation: scaffold, auth, multi-tenant data model, OpenRouter provider |
| V0.2    | Brand Voice primitive (analyzer agent, audit playground) |
| V1.0    | Copywriter + Localizer agents 🚀 |
| V1.1    | Long-form editor (Tiptap) with inline AI commands |
| V1.2    | Knowledge base (pgvector) |
| V1.3    | Chat assistant |
| V1.4    | Campaigns (multi-asset orchestration) |
| V1.5    | Custom templates + recipes |
| V1.6    | Workspaces, invitations, role management UI |
| V2.0    | Browser extension, exports, Helm chart, docs site |

## License

MIT — see [LICENSE](LICENSE).
