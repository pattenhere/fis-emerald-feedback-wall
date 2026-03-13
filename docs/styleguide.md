# FIS Emerald Prototype Styleguide

This prototype now uses a shared token stylesheet at:

- `src/styles/styleguide.css`

Use these tokens in all UI CSS before introducing hard-coded values.

## Visual Direction

Based on provided FIS reference screens:

- Clean enterprise UI for the core app (light, neutral, high-contrast tables/cards).
- Strong FIS green for primary actions and active indicators.
- Deep blue/navy framing for high-density controls and headers.
- Universe view keeps the neon-cosmic style, but is now tokenized under the same system.

## Core Brand Tokens

- `--fis-green-700`: primary action/active (`#2f9e44`)
- `--fis-green-600`: primary hover/support (`#3dbb52`)
- `--fis-green-500`: bright accent (`#57cd5d`)
- `--fis-blue-900`: deep navy (`#061a24`)
- `--fis-blue-800`: supporting dark blue (`#0c2a3c`)
- `--fis-cyan-500`: data/interactive cyan (`#4fd9ff`)

## App Theme Tokens (Light)

- `--bg`: page background
- `--surface`: standard surface
- `--surface-strong`: elevated/white surface
- `--line`: borders/dividers
- `--ink`: primary text
- `--muted`: secondary text
- `--accent`: semantic primary action (maps to FIS green)
- `--accent-soft`: low-emphasis active fill
- `--danger`: destructive/error state
- `--hero-grad`: hero area gradient
- `--ai-grad`: dark feature treatment gradient

## Universe Theme Tokens

Universe tokens are scoped by `.theme-universe`:

- `--space-bg`, `--space-bg-soft`
- `--space-panel`, `--space-line`
- `--space-cyan`, `--space-green`, `--space-blue`, `--space-gold`, `--space-orange`
- `--space-ink`

Apply `.theme-universe` to top-level universe containers to activate this palette.

## Usage Rules

- Prefer semantic tokens (`--accent`, `--line`, `--ink`) over raw hex values.
- New components should not define local `:root` color blocks.
- If a new color is needed repeatedly, add a token in `styleguide.css` first.
- Keep spacing and shape language compact/enterprise: low radius, clear borders, minimal noise.

## Refactor Status

The following are now wired to the shared token system:

- Main app entrypoint imports `styleguide.css`
- Universe entrypoint imports `styleguide.css`
- `app.css` no longer defines local root color tokens
- `universe.css` no longer defines local root color tokens
- Universe containers opt into scoped theme via `.theme-universe`
