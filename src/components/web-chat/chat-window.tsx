"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

/**
 * Self-contained chat widget rendered inside the /embed/chat/[saId]
 * iframe. Owns:
 *
 *   - session id (UUID in localStorage, scoped per sub-account)
 *   - message history (in-memory; persisted server-side per turn)
 *   - send-message API call → /api/web-chat/message
 *   - typing indicator while the reply is in flight
 *   - postMessage out to the parent window for [open|close|resize]
 *     so the floating-bubble loader can respond
 *
 * Deliberately no shadcn imports — the chat lives inside an iframe
 * with no Tailwind variables from the host page, so we use plain CSS
 * via inline styles + a tiny <style> block. Keeps the iframe bundle
 * tight and immune to the buyer's CSS bleeding in.
 */

interface ChatWindowProps {
  subAccountId: string;
  welcomeMessage: string;
  accentColor: string;
  /** Tells the parent loader to remove/hide the iframe on close. */
  embedded: boolean;
}

type CaptureFieldId = "name" | "email" | "phone";

type LocalMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  /** Set on the optimistic-render row that's waiting on the server reply. */
  pending?: boolean;
  /** When present on an assistant message, render an inline capture form
   *  below the bubble with these fields. Cleared once submitted/skipped. */
  formFields?: CaptureFieldId[];
};

function sessionStorageKey(saId: string): string {
  return `leadstack:webchat:session:${saId}`;
}

/** Generates a 22-char URL-safe random string. Server's session-id regex
 *  accepts 16-64 chars of `[a-zA-Z0-9_-]`, which this satisfies. */
function newSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function ensureSessionId(saId: string): string {
  if (typeof window === "undefined") return "";
  const key = sessionStorageKey(saId);
  let existing = window.localStorage.getItem(key);
  if (!existing) {
    existing = newSessionId();
    window.localStorage.setItem(key, existing);
  }
  return existing;
}

function postToParent(message: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (window.parent === window) return;
  window.parent.postMessage({ source: "leadstack-webchat", ...message }, "*");
}

export function ChatWindow(props: ChatWindowProps) {
  const { subAccountId, welcomeMessage, accentColor, embedded } = props;

  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [errored, setErrored] = useState(false);
  const [parentPageUrl, setParentPageUrl] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Boot: read or create the session id, capture the parent-page URL
  // from the widget loader's ?p= query param, seed the welcome message.
  useEffect(() => {
    const sid = ensureSessionId(subAccountId);
    setSessionId(sid);
    try {
      const p = new URLSearchParams(window.location.search).get("p");
      if (p) setParentPageUrl(p);
    } catch {
      // No-op — parent URL is purely for server-side logging.
    }
    setMessages([
      { id: "welcome", role: "assistant", text: welcomeMessage },
    ]);
  }, [subAccountId, welcomeMessage]);

  // Auto-scroll to bottom on every message change.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending || !sessionId) return;

      const userMsg: LocalMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        text: trimmed,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setSending(true);
      setErrored(false);

      try {
        const res = await fetch("/api/web-chat/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sa: subAccountId,
            sessionId,
            message: trimmed,
            // Parent page URL (where the snippet is installed). Falls
            // back to document.referrer when the loader didn't pass ?p=.
            // window.location.href is the LAST resort — it's the iframe's
            // URL, not the parent's, but better than nothing for logs.
            pageUrl:
              parentPageUrl ||
              document.referrer ||
              (typeof window !== "undefined" ? window.location.href : null),
            referrer: document.referrer || null,
          }),
        });
        const data = (await res.json()) as {
          reply?: string;
          error?: string;
          formFields?: CaptureFieldId[] | null;
        };
        if (!res.ok || !data.reply) {
          throw new Error(data.error ?? "no reply");
        }
        const replyText = data.reply;
        const formFields = data.formFields ?? null;
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: replyText,
            formFields: formFields && formFields.length > 0 ? formFields : undefined,
          },
        ]);
      } catch {
        setErrored(true);
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            text:
              "I had trouble reaching the server. Try again in a moment, or refresh the page.",
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [subAccountId, sessionId, sending, parentPageUrl],
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  const handleCaptureFormDone = useCallback(
    async (
      messageId: string,
      payload:
        | { skip: true }
        | { skip?: false; name?: string; email?: string; phone?: string },
    ) => {
      if (!sessionId) return;
      // Strip the form off the originating message immediately so the
      // visitor sees it disappear regardless of network outcome.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, formFields: undefined } : m,
        ),
      );
      try {
        const res = await fetch("/api/web-chat/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sa: subAccountId,
            sessionId,
            pageUrl:
              parentPageUrl ||
              (typeof window !== "undefined" ? window.location.href : null),
            ...payload,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          reply?: string;
          error?: string;
        };
        if (!res.ok || !data.reply) {
          throw new Error(data.error ?? "capture failed");
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: data.reply!,
          },
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Network error";
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            text: msg,
          },
        ]);
      }
    },
    [subAccountId, sessionId, parentPageUrl],
  );

  function handleClose() {
    postToParent({ type: "close" });
  }

  const containerStyle = useMemo<React.CSSProperties>(
    () => ({
      // The iframe's own dimensions are controlled by the parent loader,
      // we just fill the available space.
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: "#ffffff",
      color: "#0f172a",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: "14px",
      lineHeight: 1.45,
      overflow: "hidden",
      borderRadius: embedded ? "16px" : "0",
      boxShadow: embedded ? "0 16px 48px -12px rgba(15,23,42,0.25)" : "none",
    }),
    [embedded],
  );

  return (
    <div style={containerStyle}>
      <style>{`
        .lswc-bubble {
          max-width: 80%;
          padding: 10px 14px;
          border-radius: 16px;
          word-wrap: break-word;
          white-space: pre-wrap;
        }
        .lswc-bubble-assistant {
          background: #f1f5f9;
          color: #0f172a;
          border-bottom-left-radius: 4px;
        }
        .lswc-bubble-user {
          background: ${accentColor};
          color: white;
          align-self: flex-end;
          border-bottom-right-radius: 4px;
        }
        .lswc-row {
          display: flex;
          margin-top: 10px;
        }
        .lswc-row-user { justify-content: flex-end; }
        .lswc-row-assistant { justify-content: flex-start; }
        @keyframes lswc-pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        .lswc-typing-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          margin: 0 2px;
          border-radius: 50%;
          background: #94a3b8;
          animation: lswc-pulse 1.2s infinite ease-in-out;
        }
        .lswc-typing-dot:nth-child(2) { animation-delay: 0.15s; }
        .lswc-typing-dot:nth-child(3) { animation-delay: 0.3s; }
      `}</style>

      {/* Header */}
      <div
        style={{
          background: accentColor,
          color: "white",
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
            }}
            aria-hidden
          >
            💬
          </span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Chat with us</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>
              We typically reply instantly
            </div>
          </div>
        </div>
        {embedded && (
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close chat"
            style={{
              background: "transparent",
              color: "white",
              border: 0,
              cursor: "pointer",
              fontSize: 22,
              lineHeight: 1,
              padding: 4,
              opacity: 0.9,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Message scroller */}
      <div
        ref={scrollerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
          background: "#fbfbfd",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {messages.map((m) => (
          <div key={m.id}>
            <div className={`lswc-row lswc-row-${m.role}`}>
              <div className={`lswc-bubble lswc-bubble-${m.role}`}>{m.text}</div>
            </div>
            {m.role === "assistant" && m.formFields && (
              <InlineCaptureForm
                fields={m.formFields}
                accentColor={accentColor}
                onSubmit={(payload) => handleCaptureFormDone(m.id, payload)}
                onSkip={() => handleCaptureFormDone(m.id, { skip: true })}
              />
            )}
          </div>
        ))}
        {sending && (
          <div className="lswc-row lswc-row-assistant">
            <div
              className="lswc-bubble lswc-bubble-assistant"
              aria-label="Assistant is typing"
            >
              <span className="lswc-typing-dot" />
              <span className="lswc-typing-dot" />
              <span className="lswc-typing-dot" />
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 12px",
          borderTop: "1px solid #e2e8f0",
          background: "white",
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={sending ? "Waiting for reply…" : "Type a message…"}
          disabled={sending || !sessionId}
          aria-label="Type a message"
          style={{
            flex: 1,
            padding: "10px 12px",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            outline: "none",
            fontSize: 14,
            background: "white",
            color: "#0f172a",
          }}
        />
        <button
          type="submit"
          disabled={sending || !input.trim() || !sessionId}
          aria-label="Send"
          style={{
            background: accentColor,
            color: "white",
            border: 0,
            borderRadius: 10,
            padding: "0 16px",
            fontSize: 16,
            cursor: sending || !input.trim() ? "not-allowed" : "pointer",
            opacity: sending || !input.trim() ? 0.5 : 1,
          }}
        >
          ↑
        </button>
      </form>

      {errored && (
        <div
          style={{
            background: "#fef2f2",
            color: "#b91c1c",
            fontSize: 11,
            padding: "4px 12px",
            textAlign: "center",
          }}
          role="status"
        >
          Connection issue — your message may not have been delivered.
        </div>
      )}
    </div>
  );
}

/**
 * Inline capture form rendered below a bot reply when the LLM emitted
 * a [[form fields="…"]] marker. Visitor fills the requested fields and
 * clicks "Send details" — or skips. Both go to /api/web-chat/capture.
 */
function InlineCaptureForm(props: {
  fields: CaptureFieldId[];
  accentColor: string;
  onSubmit: (payload: { name?: string; email?: string; phone?: string }) => void;
  onSkip: () => void;
}) {
  const { fields, accentColor, onSubmit, onSkip } = props;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const labelFor: Record<CaptureFieldId, string> = {
    name: "Your name",
    email: "Email address",
    phone: "Phone number",
  };
  const placeholderFor: Record<CaptureFieldId, string> = {
    name: "Jane Smith",
    email: "jane@example.com",
    phone: "+61 400 000 000",
  };
  const typeFor: Record<CaptureFieldId, string> = {
    name: "text",
    email: "email",
    phone: "tel",
  };
  const valueFor: Record<CaptureFieldId, string> = {
    name,
    email,
    phone,
  };
  const setterFor: Record<CaptureFieldId, (v: string) => void> = {
    name: setName,
    email: setEmail,
    phone: setPhone,
  };

  // Submit is enabled when at least email OR phone is filled (server
  // requires one of these — name alone isn't enough to follow up).
  const canSubmit =
    !submitting &&
    (!fields.includes("email") || email.trim().length > 0
      ? true
      : false) &&
    (!fields.includes("phone") || phone.trim().length > 0 ? true : false) &&
    (email.trim().length > 0 || phone.trim().length > 0);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    onSubmit({
      name: name.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        marginTop: 8,
        marginLeft: 0,
        marginRight: 0,
        padding: 14,
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {fields.map((f) => (
        <label
          key={f}
          style={{ display: "flex", flexDirection: "column", gap: 4 }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>
            {labelFor[f]}
          </span>
          <input
            type={typeFor[f]}
            value={valueFor[f]}
            onChange={(e) => setterFor[f](e.target.value)}
            placeholder={placeholderFor[f]}
            disabled={submitting}
            required={f === "email" || f === "phone"}
            style={{
              padding: "8px 10px",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 14,
              outline: "none",
              background: "white",
              color: "#0f172a",
            }}
          />
        </label>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            flex: 1,
            background: accentColor,
            color: "white",
            border: 0,
            borderRadius: 8,
            padding: "9px 12px",
            fontSize: 13,
            fontWeight: 600,
            cursor: canSubmit ? "pointer" : "not-allowed",
            opacity: canSubmit ? 1 : 0.5,
          }}
        >
          {submitting ? "Sending…" : "Send details"}
        </button>
        <button
          type="button"
          onClick={() => {
            setSubmitting(true);
            onSkip();
          }}
          disabled={submitting}
          style={{
            background: "transparent",
            color: "#64748b",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: "9px 12px",
            fontSize: 13,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          Skip
        </button>
      </div>
    </form>
  );
}
