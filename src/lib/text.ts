/** Lower-case and strip diacritics: "Balkón Vinohrady" -> "balkon vinohrady". */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
