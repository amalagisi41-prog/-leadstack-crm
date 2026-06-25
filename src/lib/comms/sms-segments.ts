/**
 * GSM-7 / UCS-2 segment counter. Shared by the server validator and the
 * client composer character counter — no server-only guard so it can run
 * in the browser.
 *
 * GSM-7 basic + extended characters fit 160 chars per segment (153 per
 * segment when the message is multipart due to the 6-byte UDH). UCS-2
 * (any non-GSM char present) drops to 70 chars per segment (67 multipart).
 */

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f";

function isGsm7(text: string): boolean {
  for (const ch of text) {
    if (!GSM_BASIC.includes(ch) && !GSM_EXTENDED.includes(ch)) return false;
  }
  return true;
}

function gsmLength(text: string): number {
  let n = 0;
  for (const ch of text) {
    n += GSM_EXTENDED.includes(ch) ? 2 : 1;
  }
  return n;
}

export interface SegmentInfo {
  segments: number;
  length: number;
  perSegment: number;
  encoding: "GSM-7" | "UCS-2";
}

export function segmentInfo(text: string): SegmentInfo {
  if (isGsm7(text)) {
    const length = gsmLength(text);
    if (length === 0) return { segments: 0, length: 0, perSegment: 160, encoding: "GSM-7" };
    if (length <= 160) return { segments: 1, length, perSegment: 160, encoding: "GSM-7" };
    return {
      segments: Math.ceil(length / 153),
      length,
      perSegment: 153,
      encoding: "GSM-7",
    };
  }
  const length = Array.from(text).length;
  if (length === 0) return { segments: 0, length: 0, perSegment: 70, encoding: "UCS-2" };
  if (length <= 70) return { segments: 1, length, perSegment: 70, encoding: "UCS-2" };
  return {
    segments: Math.ceil(length / 67),
    length,
    perSegment: 67,
    encoding: "UCS-2",
  };
}
