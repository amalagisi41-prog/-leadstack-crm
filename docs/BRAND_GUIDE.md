# AgentStack Brand Mark Guide

These are the final approved AgentStack marks. Use the shared `LogoMark` component in product code so the correct asset is selected consistently.

## Approved versions

### Light backgrounds

Use `public/brand/agentstack-mark-on-light.png` on white, cream, pale gray, and other light surfaces. This version uses navy and coral chevrons with the navy smiling bot.

In React, this is the default:

```tsx
<LogoMark />
```

### Dark or colored backgrounds

Use `public/brand/agentstack-app-tile.png` as the self-contained tile mark for app icons, install prompts, launch surfaces, and dark or colored contexts. The UI-ready transparent-edge derivative is `public/icons/logo-dark-192.png`.

In React:

```tsx
<LogoMark tone="dark" />
```

## Non-negotiable contrast rule

Cream chevrons must never appear directly on a white, cream, pale gray, or other light background. Cream chevrons are approved only inside the blue tile artwork. On any light background, use the navy/coral light-background mark.

## Asset roles

| Asset | Use |
| --- | --- |
| `agentstack-mark-on-light.png` | Master mark for light backgrounds |
| `agentstack-app-tile.png` | Master self-contained app tile |
| `logo-light-192.png`, `logo-light-512.png` | Web UI derivatives for light backgrounds |
| `logo-dark-192.png`, `logo-dark-512.png` | Transparent-edge tile derivatives for colored/dark UI |
| `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` | PWA and install icons |
| `apple-touch-icon.png` | Apple home-screen icon |
| `src/app/icon.png` | Next.js browser/app metadata icon |

Additional marketplace, app-store, social, web, and UI exports are organized under `public/brand/exports`. See that folder's `README.md` and `asset-manifest.json` for recommended placements and sizes.

## Consistency

- Do not recolor, rotate, stretch, redraw, or rearrange the mark.
- Keep the mark square and use `object-fit: contain` when placed in a fixed frame.
- Do not place text or UI controls over the mark.
- Use the tile at small app-icon sizes because its solid field preserves contrast.
- Keep source masters in `public/brand`; regenerate web derivatives from those masters rather than from compressed thumbnails.
