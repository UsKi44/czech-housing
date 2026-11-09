/** Find a Czech apartment layout like "2+kk" or "3 + 1" in free text. */
export function layoutFromText(text: string | null | undefined): string | null {
  const m = text?.match(/(?<![\d+])([1-6])\s*\+\s*(kk|1)(?![a-z\d])/i);
  if (!m) return null;
  return Number(m[1]) >= 6 ? "6+" : `${m[1]}+${m[2].toLowerCase()}`;
}
