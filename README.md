# OpenCopy

Open-source, self-hostable AI copywriting platform — **agentic copywriters and localizers, brand-voice-aware, knowledge-grounded, multi-tenant**.

## What it does

- **Brand Voice** as the spine — paste samples, get a structured voice profile (tone, do's, don'ts, audience, vocabulary). Every agent reads from it.
- **Copywriter agent** — planner → parallel drafters → voice auditor → refiner. Multi-variant on-brand copy.
- **Localizer agent** — cultural adapter → localizer → back-translator → voice auditor. Transcreation across **EN · PL · RO · UA**.
- **Knowledge base** — pgvector-backed retrieval. Sources injected into agents at run time.
- **Long-form editor** — Tiptap with `/compose`, `/continue`, `/rephrase`, `/expand`, `/shorten`, `/explain`, `/change-tone` slash commands and selection bubble menu.
- **Chat assistant** — threaded, voice-grounded, KB-grounded, streaming.
- **Campaigns** — one brief produces a coordinated bundle (blog + social + ad + email + landing) with per-channel angles.
- **Workspaces + teams** — invitations (email or copy-link), 4 roles (owner / admin / editor / viewer), workspace switcher.
- **Provider polish** — OpenRouter as the default; direct Anthropic / OpenAI / Google / Mistral keys; Ollama for fully air-gapped self-host. Cost dashboard.
- **Exports** — Markdown / HTML / DOCX per document and per library variant.

## Stack

Next.js 15 · TypeScript · Tailwind v4 · shadcn/ui · Geist · Postgres + Drizzle · Auth.js v5 · Vercel AI SDK · OpenRouter / Anthropic / OpenAI / Google / Mistral / Ollama. MIT licensed.

---

## Quickstart — interactive wizard ⚡

```bash
pnpm install
pnpm bootstrap
pnpm dev
```

`pnpm bootstrap` is an interactive CLI that:
1. Generates `AUTH_SECRET` + `ENCRYPTION_KEY`
2. Prompts for your `DATABASE_URL` and tests the connection
3. Verifies the `pgvector` extension
4. Writes `.env` (preserving any existing keys)
5. Runs all migrations

You'll just paste a Postgres URL when asked. The fastest free option is **Neon** ([neon.tech](https://neon.tech) — no credit card; pgvector pre-installed). Supabase free tier works too.

After `pnpm dev`:

1. Sign in — any email + any password (≥6 chars; dev provider is on)
2. **Settings → AI Providers** → paste your **OpenRouter** key ([openrouter.ai/keys](https://openrouter.ai/keys))
3. **Settings → AI Providers → Embeddings** → paste your **OpenAI** key ([platform.openai.com/api-keys](https://platform.openai.com/api-keys)) — required for the knowledge base
4. **Settings → AI Providers → Model defaults** → pick models per role (planning · drafting · fast · critic)
5. **Brand voices → New voice** → paste samples → **Analyze**
6. Try **Agents → Copywriter** or **Agents → Localizer**, **Documents**, **Chat**, **Campaigns**

## Manual quickstart (if you don't want the wizard)

```bash
pnpm install
cp .env.example .env
# edit .env: set DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY
pnpm db:migrate
pnpm dev
```

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Self-host (production)

Docker Compose (app + Postgres with pgvector):

```bash
docker compose --profile full up -d
docker compose exec app pnpm db:migrate
```

For real deployments, set `AUTH_SECRET`, `ENCRYPTION_KEY`, and `DATABASE_URL` to production values, configure email (`AUTH_RESEND_KEY` for invitations), and put a reverse proxy in front (Caddy / Traefik / nginx).

## Provider configuration

OpenRouter is the default gateway — one key, every model. **Settings → AI Providers** also accepts:

- **Anthropic** direct (Claude Opus / Sonnet / Haiku) — skip OpenRouter's markup
- **OpenAI** direct (GPT-4.1, o3, etc. + embeddings)
- **Google** direct (Gemini 2.0 Flash / Pro)
- **Mistral** direct (Large / Small / Nemo)
- **Ollama** — base URL only, fully air-gapped (defaults to `http://localhost:11434/api`)

Per-role provider override under **Model defaults** routes specific roles through whichever provider you pick.

## Locales

V1.0 ships **EN · PL · RO · UA**. The Localizer's Cultural Adapter understands the formality / honorifics distinctions across these (Pan/Pani in PL, dumneavoastră/tu in RO, ви/ти in UA + war-context language sensitivity).

## Scripts

| Command | Purpose |
|---|---|
| `pnpm bootstrap` | Interactive setup wizard |
| `pnpm dev` | Dev server with Turbopack |
| `pnpm build` | Production build |
| `pnpm start` | Run the production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:generate` | Generate new SQL migrations from schema diffs |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:studio` | Drizzle Studio (DB browser) |

## Roadmap

| Version | Status | Theme |
|---|---|---|
| V0.1 | ✅ | Scaffold + auth + multi-tenant data model + OpenRouter |
| V0.2 | ✅ | Brand voice primitive + agent core |
| V1.0 | ✅ | Copywriter + Localizer agents |
| V1.1 | ✅ | Long-form editor + inline AI commands |
| V1.2 | ✅ | Knowledge base (pgvector) |
| V1.3 | ✅ | Chat assistant |
| V1.4 | ✅ | Campaigns (multi-asset orchestration) |
| V1.5 | ✅ | Direct providers + Ollama + cost dashboard |
| V1.6 | ✅ | Workspaces + invitations + member management |
| V1.7 | ✅ | Exports (MD / HTML / DOCX) + Resend invitation email |
| V1.8 | next | Browser extension (Chrome/Firefox MV3) |
| V1.9 |  | Helm + Coolify/Dokploy + docs site |
| V2.0 |  | REST API + webhooks + admin + i18n |

## License

MIT — see [LICENSE](LICENSE).
