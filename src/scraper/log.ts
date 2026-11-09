export function log(msg: string): void {
  const t = new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Prague" });
  console.log(`[${t}] ${msg}`);
}
