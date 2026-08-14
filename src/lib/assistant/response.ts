export interface ParsedAssistantResponse {
  answer?: unknown;
  action?: unknown;
}

export function parseAssistantResponse(
  text: string
): ParsedAssistantResponse | null {
  const trimmed = text.trim();
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""),
  ];
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as ParsedAssistantResponse;
      }
    } catch {
      // Try the next safe representation.
    }
  }
  return null;
}

export function cleanAssistantAnswer(value: string): string {
  let answer = value.trim();
  for (let depth = 0; depth < 2; depth += 1) {
    const parsed = parseAssistantResponse(answer);
    if (!parsed || typeof parsed.answer !== "string") break;
    answer = parsed.answer.trim();
  }
  return answer
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
