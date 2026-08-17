/**
 * Cache-buster for the app icons. **Bump this whenever the artwork changes.**
 *
 * Browsers decide whether an installed app's icon needs re-fetching by
 * comparing manifest icon *URLs*, not their contents. Replace the bytes at
 * `/icons/icon-192.png` and leave the URL alone and Chrome sees an identical
 * manifest, concludes nothing changed, and never re-mints the Android WebAPK —
 * so the old artwork stays on the home screen indefinitely. Changing the query
 * string makes the change visible to them.
 *
 * This does not, and cannot, refresh an icon already sitting in a macOS Dock or
 * on an iOS home screen. Those platforms snapshot the icon at install time and
 * expose no API to replace it; the only fix there is to remove the app and add
 * it again. Bumping this still matters, because it is what gets Android and
 * desktop Chrome to pick the new artwork up on their own.
 */
export const ICON_VERSION = "2";

/** Append the current icon version to an icon path. */
export function versionedIcon(path: string): string {
  return `${path}?v=${ICON_VERSION}`;
}
