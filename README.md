# Emerald Feedback Wall Prototype

Base repository scaffold for the Emerald Feedback Wall conference kiosk described in:
`Emerald Feedback Wall — Product Requirements Document.pdf`.

## What Is Included

- React + TypeScript + Vite project baseline
- PRD-aligned information architecture shell
- Left drawer with `Features`, `Kudos`, and `Synthesis` tabs
- Always-on hero area for app/screen feedback flow
- Domain types and seeded conference data
- Synthesis service integration point (placeholder stream)
- Environment template for upcoming Anthropic/API integration

## Current Status

Implemented local prototype flows:

- Feature request add + upvote + ordering (new items surfaced first, then vote-sorted)
- Kudos submission with optional role and explicit public-consent flag
- Screen feedback capture with required type tag and optional context text
- Next-screen prompt after successful screen feedback submission
- PIN-gated synthesis panel (4-6 digits) with live signal summary
- Roadmap/PRD markdown generation from captured local signals with token streaming
- Copy and clear controls for synthesis output

Anthropic API integration is still pending; synthesis currently uses local deterministic generation.

## OpenAI Core Module

A reusable OpenAI client module now exists at:

- `src/core/ai/openaiClient.ts`

It supports:

- Non-streaming text generation via the Responses API (`createOpenAIText`)
- Streaming text generation (`streamOpenAIText`)
- Config checks (`isOpenAIConfigured`, `getOpenAIClientInfo`)

Environment flags:

- `VITE_OPENAI_API_KEY`
- `VITE_OPENAI_MODEL`
- `VITE_OPENAI_BASE_URL`
- `VITE_OPENAI_PROJECT`
- `VITE_OPENAI_ORGANIZATION`
- `VITE_ANTHROPIC_API_KEY`
- `VITE_ANTHROPIC_MODEL`
- `VITE_ANTHROPIC_BASE_URL`
- `VITE_ANTHROPIC_VERSION`
- `VITE_SYNTHESIS_PHASE1_TIMEOUT_MS` (client-side Phase 1 timeout, default `180000`)
- `VITE_INSTITUTION_AI_PROVIDER` (`openai` or `anthropic`)
- `VITE_INSTITUTION_MATCH_THRESHOLD` (default `0.6`, medium+)
- `AI_PROVIDER_NON_STREAM_TIMEOUT_MS` (server-side end-to-end timeout for `/api/ai/complete`, default `240000`)
- `AI_COMPLETE_ROUTE_TIMEOUT_MS` (proxy route timeout budget for `/api/ai/complete`, default `300000`)

## Styleguide

Design tokens and visual system guidance live in:

- `docs/styleguide.md`
- `src/styles/styleguide.css`

## Run

```bash
npm install
npm run dev
```

## Validate

```bash
npm run typecheck
npm run build
```

## Vercel Deployment Notes

Set these environment variables in Vercel for preview/production deployments:

- `SYNTHESIS_PIN` (or `VITE_SYNTHESIS_PIN`) for facilitator unlock
- `SYNTHESIS_AUTH_SECRET` for signed facilitator auth tokens across serverless instances
- `FEEDBACK_DB_ENGINE=postgres` with `FEEDBACK_DATA_SOURCE=db` for durable persistence
- `POSTGRES_URL` (and optionally `POSTGRES_URL_NON_POOLING`) when using Postgres
- `SYNTHESIS_API_PROVIDER` (`anthropic` or `openai`)
- Provider key for selected provider:
  - `ANTHROPIC_API_KEY` when using Anthropic
  - `OPENAI_API_KEY` when using OpenAI

Recommended for Vercel:

- Leave `VITE_SYNTHESIS_API_BASE_URL` empty so the client uses same-origin `/api/*`.
- Set `FEEDBACK_DATA_SOURCE=flat` unless you have migrated + seeded Postgres and explicitly want DB mode.
- Verify `GET /api/health` includes `"synthesisPinConfigured": true` after setting env vars.
- Use server-side secrets (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) and avoid `VITE_*` API keys in Vercel.
- Optionally set `API_ALLOWED_ORIGIN` to a comma-separated allowlist of exact web origins.

## Data Model

First table added:

- `PRODUCTS` (see `db/migrations/001_create_products.sql`)
- `INSTITUTION_PROFILES` (see `db/migrations/002_create_institution_profiles.sql`)
- `PRODUCT_FEATURE_CATEGORIES` (see `db/migrations/003_create_product_feature_categories.sql`)
- `PRODUCT_FEATURES` (see `db/migrations/005_create_product_features.sql`)

Seed data from current lending product taxonomy:

- `db/seeds/001_products_seed.sql`
- `db/seeds/002_institution_profiles_seed.sql`
- `db/seeds/003_product_feature_categories_seed.sql`
- `db/seeds/004_product_features_seed.sql`

Quick local SQLite bootstrap:

```bash
sqlite3 db/app.db < db/migrations/001_create_products.sql
sqlite3 db/app.db < db/migrations/002_create_institution_profiles.sql
sqlite3 db/app.db < db/migrations/003_create_product_feature_categories.sql
sqlite3 db/app.db < db/migrations/004_add_ids_to_product_feature_categories.sql
sqlite3 db/app.db < db/migrations/005_create_product_features.sql
sqlite3 db/app.db < db/seeds/001_products_seed.sql
sqlite3 db/app.db < db/seeds/002_institution_profiles_seed.sql
sqlite3 db/app.db < db/seeds/003_product_feature_categories_seed.sql
sqlite3 db/app.db < db/seeds/004_product_features_seed.sql
```

## System Administrator View

The app now includes a `System Admin` page (toggle from top bar) that displays seed data table-by-table with:

- table list and row/column counts
- paginated result grid
- reusable pagination module:
  - `src/modules/pagination/usePagination.ts`
  - `src/modules/pagination/PaginationControls.tsx`

## Next Build Phase

- Anthropic synthesis API integration with streaming
- Offline persistence and event reset controls
- Facilitator-specific admin lock/session behavior
