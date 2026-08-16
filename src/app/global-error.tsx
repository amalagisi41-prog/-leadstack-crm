"use client";

/**
 * Last-resort boundary, for a failure in the root layout itself.
 *
 * `app/error.tsx` cannot catch those — the layout it would render inside is
 * the thing that threw — so this one replaces the whole document and must
 * ship its own <html> and <body>. Deliberately dependency-free and
 * inline-styled: whatever broke may be the stylesheet, the theme provider, or
 * a shared component, so this page cannot rely on any of them.
 *
 * The realistic trigger is a misconfigured deploy — an expired or missing
 * Firebase key in a new environment — which fails for every user at once. A
 * white screen there means every agent contacts support on the same morning
 * and nobody can say what happened.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: "34rem",
            width: "100%",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            padding: "24px",
          }}
        >
          <h1 style={{ fontSize: "1.125rem", margin: "0 0 8px", fontWeight: 600 }}>
            We couldn’t load AgentStack
          </h1>
          <p
            style={{
              margin: "0 0 20px",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#475569",
            }}
          >
            Your account and data are safe — nothing was changed or lost. This
            is a problem loading the app itself. Try again in a moment; if it
            persists, the reference below identifies exactly what failed.
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                background: "#173b7a",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "10px 14px",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* A plain anchor on purpose. `next/link` does a client-side
                navigation through the router — which, in a global error, may
                be part of what failed. A full document load is the only exit
                that is guaranteed to work here. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                padding: "10px 14px",
                fontSize: "0.875rem",
                fontWeight: 500,
                textDecoration: "none",
                color: "#0f172a",
              }}
            >
              Reload from the start
            </a>
          </div>
          <p
            style={{
              margin: "20px 0 0",
              fontSize: "0.75rem",
              lineHeight: 1.6,
              color: "#64748b",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "12px",
            }}
          >
            Reference:{" "}
            <code style={{ fontWeight: 600 }}>
              {error.digest ?? "no-reference"}
            </code>
          </p>
        </div>
      </body>
    </html>
  );
}
