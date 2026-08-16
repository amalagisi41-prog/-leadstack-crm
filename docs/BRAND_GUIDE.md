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

## Approved versions

### Light backgrounds

Use `public/brand/agentstack-mark-on-light.png` on white, pale gray, and other
light surfaces. The self-contained warm-cream tile increases edge and silhouette
readability when the mark is reduced.

In React, this is the default:

```tsx
<LogoMark />
```

### Dark or colored backgrounds

Use `public/brand/agentstack-app-tile-dark.png` on navy, black, saturated,
photographic, or otherwise dark surfaces. It preserves the navy tile treatment
from the original attached mark, including its cream upper chevron and cream
robot, while removing the lower chevron. The UI derivative is
`public/icons/logo-dark-192.png`.

In React:

```tsx
<LogoMark tone="dark" />
```

### App, marketplace, social, and install icons

Use `public/brand/agentstack-app-tile.png`, the cream-tile primary master. All
PWA, app-store, marketplace, web-icon, and social-profile exports are derived
from this master because it remains clearer at small sizes.

## Non-negotiable contrast rule

Use the cream-tile primary on light or mixed contexts and the navy-tile
alternate on dark or colored contexts. Do not place the navy-tile alternate on
a similar navy surface without adequate separation. The lower chevron is
retired. Never swap the approved chevron or robot colors between variants.

## Asset roles

| Asset                                                   | Use                                                   |
| ------------------------------------------------------- | ----------------------------------------------------- |
| `agentstack-mark-on-light.png`                          | Master mark for light backgrounds                     |
| `agentstack-app-tile.png`                               | Primary cream-tile app and small-size master          |
| `agentstack-app-tile-dark.png`                          | Alternate navy-tile master for dark/colored surfaces  |
| `logo-light-192.png`, `logo-light-512.png`              | Web UI derivatives for light backgrounds              |
| `logo-dark-192.png`, `logo-dark-512.png`                | Transparent-edge tile derivatives for colored/dark UI |
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
