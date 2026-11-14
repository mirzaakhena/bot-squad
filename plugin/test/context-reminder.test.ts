import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCapturedStatus, type ReadStatus } from "../context.ts";
import {
  contextReminderMeta,
  contextUsage,
  MAX_CONTEXT_PERCENT,
  MAX_CONTEXT_USED,
  REMINDER_META_KEY,
  reminderFor,
} from "../context-reminder.ts";

/** Tiket 261114101207: matriks pengingat konteks menipis. */

const ok = (context_window: unknown): ReadStatus => ({
  kind: "ok",
  status: { captured_at_ms: 1, payload: { context_window: context_window as any } },
});
const cw = (used: number, size: number, pct = (used / size) * 100) => ({
  total_input_tokens: used,
  context_window_size: size,
  used_percentage: pct,
});

test("ambangnya 400 ribu token dan 50%", () => {
  expect(MAX_CONTEXT_USED).toBe(400_000);
  expect(MAX_CONTEXT_PERCENT).toBe(50);
});

test("di atas ambang: jendela 1M di atas 400 ribu token", () => {
  const t = reminderFor(ok(cw(412_345, 1_000_000)));
  expect(t).toBeDefined();
  expect(t).toContain("412.3k dari 1M token (41%)");
  expect(t).toContain("pemilik");
});

test("di atas ambang: jendela 200 ribu di atas 50%", () => {
  const t = reminderFor(ok(cw(120_000, 200_000)));
  expect(t).toContain("120.0k dari 200.0k token (60%)");
});

test("di atas ambang: hanya used_percentage, tanpa token", () => {
  expect(reminderFor(ok({ used_percentage: 75 }))).toContain("75%");
});

test("di atas ambang: used_percentage dibulatkan ke 50 tetapi hitungan token di atas 50%", () => {
  expect(reminderFor(ok(cw(100_400, 200_000, 50)))).toBeDefined();
});

test("di bawah ambang dan tepat di ambang: tidak ada pengingat", () => {
  expect(reminderFor(ok(cw(399_999, 1_000_000)))).toBeUndefined();
  expect(reminderFor(ok(cw(400_000, 1_000_000)))).toBeUndefined();
  expect(reminderFor(ok(cw(100_000, 200_000)))).toBeUndefined();
  expect(reminderFor(ok(cw(90_000, 200_000)))).toBeUndefined();
  expect(reminderFor(ok(cw(0, 1_000_000)))).toBeUndefined();
});

test("data tidak ada atau tidak pasti: tidak ada pengingat", () => {
  expect(reminderFor({ kind: "missing" })).toBeUndefined();
  expect(reminderFor({ kind: "unreadable", reason: "JSON rusak" })).toBeUndefined();
  expect(reminderFor({ kind: "ok", status: { captured_at_ms: 1, payload: {} } })).toBeUndefined();
  // Sesi baru sebelum giliran pertama, atau sesudah /compact.
  expect(reminderFor(ok({ total_input_tokens: 0, context_window_size: 200_000, used_percentage: null }))).toBeUndefined();
  // used_percentage tidak ada sama sekali walau tokennya besar: tidak bisa dipastikan.
  expect(reminderFor(ok({ total_input_tokens: 900_000, context_window_size: 1_000_000 }))).toBeUndefined();
  expect(reminderFor(ok({ used_percentage: "80" }))).toBeUndefined();
  expect(reminderFor(ok(null))).toBeUndefined();
  expect(contextUsage(ok({ used_percentage: Number.NaN }))).toBeNull();
});

test("teks aman sebagai atribut tag", () => {
  for (const c of [cw(412_345, 1_000_000), cw(150_000, 200_000), { used_percentage: 99 }]) {
    expect(reminderFor(ok(c))!).not.toMatch(/["<>\[\];\n]/);
  }
});

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

test("contextReminderMeta membaca status.json dan tidak pernah melempar", () => {
  const dir = mkdtempSync(join(tmpdir(), "bot-squad-reminder-"));
  dirs.push(dir);
  const path = join(dir, "status.json");

  expect(contextReminderMeta(dir)).toEqual({}); // belum ada berkas

  writeCapturedStatus(path, { context_window: cw(500_000, 1_000_000) }, 1);
  expect(contextReminderMeta(dir)[REMINDER_META_KEY]).toContain("500.0k dari 1M token (50%)");

  // Kembali di bawah ambang (mis. sesudah /clear): pengingat hilang sendiri.
  writeCapturedStatus(path, { context_window: { total_input_tokens: 0, context_window_size: 1_000_000, used_percentage: null } }, 2);
  expect(contextReminderMeta(dir)).toEqual({});

  writeFileSync(path, "{rusak");
  expect(contextReminderMeta(dir)).toEqual({});

  expect(contextReminderMeta(join(dir, "tidak-ada"))).toEqual({});
});
