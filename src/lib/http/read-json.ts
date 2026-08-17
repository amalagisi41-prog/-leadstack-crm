/**
 * Read a JSON response without assuming there is one.
 *
 * `Response.json()` throws a DOM exception on an empty or non-JSON body, and
 * that exception usually ends up in a toast verbatim. The operator asked
 * about their website and is told "Failed to execute 'json' on 'Response':
 * Unexpected end of JSON input" — a sentence about our infrastructure, with
 * nothing in it they can act on.
 *
 * An empty body is not an exotic case. A serverless function killed at its
 * duration limit writes nothing at all; so does an unhandled throw inside a
 * route handler, and so do most gateway errors. Every one of those reaches
 * the browser as a successful fetch with a body that will not parse.
 *
 * So: read the body as text first, parse it if it is parseable, and otherwise
 * synthesise the `{ error }` shape the callers already expect — with a
 * sentence describing what happened and what to do about it.
 */

/** What to say when the server sent nothing we can read. */
export function transportMessage(response: Response): string {
  if (response.status === 408 || response.status === 504) {
    return "That took too long and timed out before it finished. Try again — a smaller or simpler page usually goes through.";
  }
  if (response.status === 413) {
    return "That was too large to process. Try a smaller page or file.";
  }
  if (response.status === 401 || response.status === 403) {
    return "Your session has expired. Sign in again, then retry.";
  }
  if (response.status >= 500) {
    return "The server hit a problem and sent nothing back. Nothing was saved — try again in a moment.";
  }
  if (response.ok) {
    return "The server sent back an empty reply, so we could not confirm it worked. Refresh and check before trying again.";
  }
  return `The server returned an error (${response.status}). Try again in a moment.`;
}

/**
 * Parse a JSON response, falling back to a readable `{ error }` when the body
 * is empty or not JSON. Never throws.
 */
export async function readJson<T extends object>(
  response: Response
): Promise<Partial<T> & { error?: string }> {
  type Result = Partial<T> & { error?: string };
  let text = "";
  try {
    text = await response.text();
  } catch {
    return { error: transportMessage(response) } as Result;
  }

  if (text.trim()) {
    try {
      const parsed = JSON.parse(text) as Result;
      // A JSON `null`, or a bare string, is not the object callers destructure.
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // An HTML error page from a proxy, most often. Nothing to salvage.
    }
  }

  return { error: transportMessage(response) } as Result;
}
