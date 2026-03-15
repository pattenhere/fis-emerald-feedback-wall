# Vercel Postgres Scaffolding

This project now includes Postgres scaffolding for Vercel deployment:

- `server/db/postgres/client.mjs`: pooled Postgres client helper
- `server/db/postgres/migrations/001_init.sql`: initial relational schema
- `server/db/postgres/migrate.mjs`: migration runner with migration tracking table

## Install dependency

```bash
npm install
```

## Required environment variables

Set in Vercel Project Settings > Environment Variables:

- `POSTGRES_URL` (or `POSTGRES_URL_NON_POOLING`)
- `FEEDBACK_DB_ENGINE=postgres` (scaffolding flag)
- `FEEDBACK_DATA_SOURCE=db` (if/when you switch from flat mode)

Optional pool tuning:

- `POSTGRES_MAX_CLIENTS` (default `5`)
- `POSTGRES_IDLE_TIMEOUT_MS` (default `10000`)
- `POSTGRES_CONNECTION_TIMEOUT_MS` (default `10000`)
- `POSTGRES_SSL` (default `true`)

## Run migrations

```bash
npm run db:pg:status
npm run db:pg:migrate
```

## Seed Postgres from flat seed files

```bash
npm run db:pg:seed
npm run db:pg:verify
```

`db:pg:seed` uses the same mapping logic as System Admin reseed in Postgres DB mode.
`db:pg:verify` prints row counts for all core tables.

## Notes

- This scaffolding creates the full ERD-aligned tables and indexes.
- Current API request handlers are still using existing SQLite/flat data paths.
- Next step is wiring read/write routes to Postgres queries behind `FEEDBACK_DB_ENGINE=postgres`.
