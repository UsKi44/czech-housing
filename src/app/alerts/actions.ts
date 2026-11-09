"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, nowIso } from "@/lib/db";
import { describeFilters, parseFilters, toQuery } from "@/lib/filters";
import { sendTelegram } from "@/lib/telegram";

export async function createAlert(form: FormData): Promise<void> {
  const f = parseFilters(new URLSearchParams(String(form.get("query") ?? "")));
  const query = toQuery(f);
  const name = String(form.get("name") ?? "").trim().slice(0, 200) || describeFilters(f);
  const db = getDb();
  const exists = db.prepare("SELECT id FROM alerts WHERE query = ?").get(query);
  if (!exists) db.prepare("INSERT INTO alerts(name, query, created_at) VALUES(?, ?, ?)").run(name, query, nowIso());
  redirect("/alerts?saved=1");
}

export async function deleteAlert(form: FormData): Promise<void> {
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  const db = getDb();
  db.prepare("DELETE FROM sent_alerts WHERE alert_id = ?").run(id);
  db.prepare("DELETE FROM alerts WHERE id = ?").run(id);
  revalidatePath("/alerts");
}

export async function renameAlert(form: FormData): Promise<void> {
  const id = Number(form.get("id"));
  const name = String(form.get("name") ?? "").trim().slice(0, 200);
  if (!Number.isInteger(id) || !name) return;
  getDb().prepare("UPDATE alerts SET name = ? WHERE id = ?").run(name, id);
  revalidatePath("/alerts");
}

export async function testTelegram(): Promise<void> {
  const r = await sendTelegram("✅ Prague Rentals: Telegram alerts are working.");
  redirect(r.ok ? "/alerts?test=ok" : `/alerts?test=${encodeURIComponent(r.error ?? "failed")}`);
}
