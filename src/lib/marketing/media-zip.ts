/**
 * Helpers for the media ZIP download endpoint.
 * Extracted for testability — the route handler itself needs Firebase.
 */

/**
 * Given a set of already-used file names and a raw candidate, return a name
 * that won't collide. Mutates `usedNames` by adding the chosen name.
 */
export function uniqueFileName(raw: string, usedNames: Set<string>): string {
  // Strip path separators that would create subdirectories inside the ZIP
  const sanitized = raw.replace(/[/\\]/g, "-");
  let candidate = sanitized;
  let counter = 1;
  while (usedNames.has(candidate)) {
    const dot = sanitized.lastIndexOf(".");
    if (dot > 0) {
      candidate = `${sanitized.slice(0, dot)}-${counter}${sanitized.slice(dot)}`;
    } else {
      candidate = `${sanitized}-${counter}`;
    }
    counter += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

/**
 * Build the download filename from a property identifier.
 */
export function zipFileName(propertyId: string): string {
  const safe = propertyId.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  return `${safe}-media.zip`;
}
