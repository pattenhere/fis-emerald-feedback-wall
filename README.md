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

## Next Build Phase

- Anthropic synthesis API integration with streaming
- Offline persistence and event reset controls
- Facilitator-specific admin lock/session behavior
