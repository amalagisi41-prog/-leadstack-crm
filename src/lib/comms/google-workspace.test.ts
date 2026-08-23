import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  buildRfc2822Message,
  toBase64Url,
  isAccessTokenExpired,
  googleWorkspaceIsConfigured,
  sendEmailViaGoogleWorkspace,
} from "./google-workspace";
import type { GoogleWorkspaceConfig } from "@/types/tenancy";

/**
 * THE REGRESSION THIS FILE EXISTS FOR
 * -----------------------------------
 * `google.gmail({ version: "v1", auth })` accepts a string, and a string is
 * treated as an API KEY — appended as `?key=<value>` with no Authorization
 * header. Passing a raw OAuth access token there produced two failures at
 * once: every Gmail send came back 401 ("API keys are not supported by this
 * API"), and the access token was written into the request URL where it
 * lands in access logs.
 *
 * It type-checked and it built. The only thing that catches it is asserting
 * on the outgoing request, which is what the first test below does.
 */

/**
 * Capture what `google.gmail()` is constructed with, and what `send()` is
 * called with, without going near the network. The real `google.auth` is
 * kept so the credential assertions below exercise the actual client.
 */
const captured: {
  auth: unknown;
  sendParams: unknown;
} = { auth: null, sendParams: null };

vi.mock("googleapis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("googleapis")>();
  return {
    google: {
      auth: actual.google.auth,
      gmail: (opts: { auth: unknown }) => {
        captured.auth = opts.auth;
        return {
          users: {
            messages: {
              send: async (params: unknown) => {
                captured.sendParams = params;
                return { data: { id: "msg_123" } };
              },
            },
          },
        };
      },
    },
  };
});

beforeEach(() => {
  captured.auth = null;
  captured.sendParams = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendEmailViaGoogleWorkspace — auth wiring", () => {
  it("never passes the access token as a bare string (which googleapis treats as an API key)", async () => {
    await sendEmailViaGoogleWorkspace({
      accessToken: "ya29.TEST_ACCESS_TOKEN",
      senderEmail: "agent@example.com",
      senderName: "Test Agent",
      to: "lead@example.com",
      subject: "Hello",
      text: "Body",
    });

    // This is the exact regression. A string here becomes `?key=<token>`:
    // no Authorization header, a 401 from Gmail, and the token in the URL.
    expect(typeof captured.auth).not.toBe("string");
    expect(captured.auth).toBeTypeOf("object");
  });

  it("passes an auth client that produces an Authorization: Bearer header", async () => {
    await sendEmailViaGoogleWorkspace({
      accessToken: "ya29.TEST_ACCESS_TOKEN",
      senderEmail: "agent@example.com",
      senderName: "Test Agent",
      to: "lead@example.com",
      subject: "Hello",
      text: "Body",
    });

    const client = captured.auth as {
      getRequestHeaders: () => Promise<Headers | Record<string, string>>;
    };
    expect(client.getRequestHeaders).toBeTypeOf("function");

    const headers = await client.getRequestHeaders();
    const authorization =
      headers instanceof Headers
        ? headers.get("authorization")
        : (headers as Record<string, string>).authorization ??
          (headers as Record<string, string>).Authorization;

    expect(authorization).toBe("Bearer ya29.TEST_ACCESS_TOKEN");
  });

  it("sends a base64url raw message for the authenticated user", async () => {
    await sendEmailViaGoogleWorkspace({
      accessToken: "ya29.TEST_ACCESS_TOKEN",
      senderEmail: "agent@example.com",
      senderName: "Test Agent",
      to: "lead@example.com",
      subject: "Hello",
      text: "Body",
    });

    const params = captured.sendParams as {
      userId: string;
      requestBody: { raw: string };
    };
    expect(params.userId).toBe("me");
    expect(params.requestBody.raw).not.toMatch(/[+/=]/);

    const decoded = Buffer.from(params.requestBody.raw, "base64url").toString(
      "utf8",
    );
    expect(decoded).toContain("To: lead@example.com");
    expect(decoded).toContain("Subject: Hello");
  });

  it("returns the Gmail message id", async () => {
    const result = await sendEmailViaGoogleWorkspace({
      accessToken: "ya29.TEST_ACCESS_TOKEN",
      senderEmail: "agent@example.com",
      senderName: "Test Agent",
      to: "lead@example.com",
      subject: "Hello",
      text: "Body",
    });

    expect(result.id).toBe("msg_123");
  });
});

describe("buildRfc2822Message — header injection", () => {
  it("strips CRLF from the subject so extra headers cannot be injected", () => {
    const message = buildRfc2822Message({
      senderEmail: "agent@example.com",
      senderName: "Test Agent",
      to: "lead@example.com",
      subject: "Hi\r\nBcc: attacker@evil.example",
      text: "Body",
    });

    const headerBlock = message.split("\r\n\r\n")[0];
    expect(headerBlock).not.toMatch(/^Bcc:/im);
    expect(message).toContain("Subject: Hi Bcc: attacker@evil.example");
  });

  it("strips CRLF from the sender name and recipient", () => {
    const message = buildRfc2822Message({
      senderEmail: "agent@example.com",
      senderName: "Agent\r\nBcc: a@evil.example",
      to: "lead@example.com\r\nBcc: b@evil.example",
      subject: "Hi",
      text: "Body",
    });

    const headerBlock = message.split("\r\n\r\n")[0];
    expect(headerBlock).not.toMatch(/^Bcc:/im);
  });

  it("RFC 2047 encodes non-ASCII header values", () => {
    const message = buildRfc2822Message({
      senderEmail: "agent@example.com",
      senderName: "Café Realty",
      to: "lead@example.com",
      subject: "Prêt à vendre ?",
      text: "Body",
    });

    expect(message).toContain("=?UTF-8?B?");
    // The raw non-ASCII must not appear in the header block.
    const headerBlock = message.split("\r\n\r\n")[0];
    expect(headerBlock).not.toContain("Prêt");
  });

  it("leaves plain ASCII headers unencoded", () => {
    const message = buildRfc2822Message({
      senderEmail: "agent@example.com",
      senderName: "Test Agent",
      to: "lead@example.com",
      subject: "Your quote is ready",
      text: "Body",
    });

    expect(message).toContain("Subject: Your quote is ready");
    expect(message).toContain("From: Test Agent <agent@example.com>");
  });

  it("adds Reply-To only when supplied", () => {
    const without = buildRfc2822Message({
      senderEmail: "a@example.com",
      senderName: "A",
      to: "b@example.com",
      subject: "s",
      text: "t",
    });
    expect(without).not.toContain("Reply-To:");

    const with_ = buildRfc2822Message({
      senderEmail: "a@example.com",
      senderName: "A",
      to: "b@example.com",
      subject: "s",
      text: "t",
      replyTo: "reply@example.com",
    });
    expect(with_).toContain("Reply-To: reply@example.com");
  });
});

describe("toBase64Url", () => {
  it("produces unpadded base64url as the Gmail API requires", () => {
    const encoded = toBase64Url("hello world??");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
    expect(Buffer.from(encoded, "base64url").toString("utf8")).toBe(
      "hello world??",
    );
  });
});

describe("isAccessTokenExpired", () => {
  it("treats a token expiring inside the 5-minute window as expired", () => {
    expect(isAccessTokenExpired(Date.now() + 60 * 1000)).toBe(true);
  });

  it("treats a token valid well beyond the window as live", () => {
    expect(isAccessTokenExpired(Date.now() + 60 * 60 * 1000)).toBe(false);
  });

  it("treats an already-past expiry as expired", () => {
    expect(isAccessTokenExpired(Date.now() - 1000)).toBe(true);
  });
});

describe("googleWorkspaceIsConfigured", () => {
  it("is false for null / undefined", () => {
    expect(googleWorkspaceIsConfigured(null)).toBe(false);
    expect(googleWorkspaceIsConfigured(undefined)).toBe(false);
  });

  it("keys off sender identity, not the access token", () => {
    // The tokens live in the server-only secrets subcollection now, so they
    // are absent from this object. Readiness must not depend on them.
    const config = {
      status: "connected",
      senderEmail: "agent@example.com",
      senderName: "Test Agent",
      connectedAt: new Date(),
      connectedByUid: "uid_1",
    } as GoogleWorkspaceConfig;

    expect(googleWorkspaceIsConfigured(config)).toBe(true);
  });

  it("is false when the sender email is missing", () => {
    const config = {
      status: "connected",
      senderEmail: "",
      senderName: "Test Agent",
      connectedAt: new Date(),
      connectedByUid: "uid_1",
    } as GoogleWorkspaceConfig;

    expect(googleWorkspaceIsConfigured(config)).toBe(false);
  });
});
