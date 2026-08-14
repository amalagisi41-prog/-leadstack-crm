import { describe, expect, it } from "vitest";
import { cleanAssistantAnswer, parseAssistantResponse } from "./response";

describe("assistant response parsing", () => {
  it("parses fenced JSON", () => {
    expect(
      parseAssistantResponse('```json\n{"answer":"Ready","action":null}\n```')
    ).toEqual({
      answer: "Ready",
      action: null,
    });
  });

  it("unwraps nested JSON instead of leaking it into chat", () => {
    expect(
      cleanAssistantAnswer('{"answer":"Audit complete","action":null}')
    ).toBe("Audit complete");
  });
});
