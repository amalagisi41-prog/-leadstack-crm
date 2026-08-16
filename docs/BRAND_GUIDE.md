# AgentStack Brand Mark Guide

These are the approved AgentStack marks as of August 16, 2026. Use the shared
`LogoMark` component in product code so the correct asset is selected
consistently.

## Mark construction

- The coral house/arrow and cream smiling robot remain unchanged.
- The lower chevron is removed from every approved version.
- The upper chevron keeps the same shape, angles, stroke proportions, negative
  space, bevel, embossing, lighting, and shadow and is 10% smaller than the
  original. It is deep dark navy on the cream tile and cream on the navy tile.
- Both versions use the same robot character and approved subtly crooked smile.
  On the cream tile, the robot and upper chevron use the darkest core navy from
  the alternate tile—not the former medium blue. On the navy tile, the robot
  and upper chevron retain the original cream color.
- The coral roof stroke must remain the same full thickness as the coral side
  and arrow stroke in both versions.
- Do not independently recreate, move, recolor, or resize any part of the mark.

## When the tile is used, and when it is not

The tile is for **standalone use only** — install and app icons, marketplace
listings, social profiles, and future branding and marketing artwork. In those
places the mark has no surface of its own, so the tile supplies one.

Everywhere the mark is placed onto a page, a slide, or a panel, use the bare
mark on a transparent background. That surface is already the mark's
background; adding a tile stacks a second one on top of it.

Never place a tile over artwork that already carries the brand.

## Approved versions

### Light backgrounds

Use `public/brand/agentstack-mark-on-light.png` — the deep core-navy mark on a
transparent background — on cream, white, pale gray, and other light surfaces.

In React, this is the default:

```tsx
<LogoMark />
```

### Dark or colored backgrounds

Use `public/brand/agentstack-mark-on-dark.png` — the cream mark on a
transparent background — on navy, black, saturated, photographic, or otherwise
dark surfaces. The UI derivative is `public/icons/logo-dark-192.png`.

In React:

```tsx
<LogoMark tone="dark" />
```

Choose the tone from the surface immediately behind the mark, not from the
page's overall theme. The navy mark vanishes on navy; the cream mark vanishes
on cream.

### App, marketplace, social, and install icons

Use `public/brand/agentstack-app-tile.png`, the cream-tile primary master. All
PWA, app-store, marketplace, web-icon, and social-profile exports are derived
from this master because it remains clearer at small sizes. The navy-tile
master `public/brand/agentstack-app-tile-dark.png` is the alternate for dark
and colored standalone placements.

## Non-negotiable contrast rule

On light or mixed surfaces use the navy mark; on dark or colored surfaces use
the cream mark. Where a tile is used standalone, the cream tile serves light
and mixed contexts and the navy tile serves dark ones — and the navy tile must
not be placed on a similar navy surface without adequate separation. The lower
chevron is retired. Never swap the approved chevron or robot colors between
variants.

## Asset roles

| Asset                                                   | Use                                                   |
| ------------------------------------------------------- | ----------------------------------------------------- |
| `agentstack-mark-on-light.png`                          | Bare navy mark, transparent — light surfaces          |
| `agentstack-mark-on-dark.png`                           | Bare cream mark, transparent — dark surfaces          |
| `agentstack-app-tile.png`                               | Primary cream-tile master — standalone icons only     |
| `agentstack-app-tile-dark.png`                          | Alternate navy-tile master — standalone icons only    |
| `logo-light-192.png`, `logo-light-512.png`              | Bare navy mark, UI derivatives                        |
| `logo-dark-192.png`, `logo-dark-512.png`                | Bare cream mark, UI derivatives                       |
| `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` | PWA and install icons                                 |
| `apple-touch-icon.png`                                  | Apple home-screen icon                                |
| `src/app/icon.png`                                      | Next.js browser/app metadata icon                     |

Additional marketplace, app-store, social, web, and UI exports are organized under `public/brand/exports`. See that folder's `README.md` and `asset-manifest.json` for recommended placements and sizes.

## Consistency

- Do not recolor, rotate, stretch, redraw, or rearrange the mark.
- Keep the mark square and use `object-fit: contain` when placed in a fixed frame.
- Do not place text or UI controls over the mark.
- Use the cream tile at small app-icon sizes because its solid field preserves contrast.
- Keep source masters in `public/brand`; regenerate web derivatives from those masters rather than from compressed thumbnails.
