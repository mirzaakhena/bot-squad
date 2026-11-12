import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPluginLog, describeError, isoLocal, redact } from "../log.ts";

/** Tiket 261112230301: unit untuk plugin/log.ts (sensor, rotasi, izin, gagal tulis). */

const TOKEN = "5002:AAFakeTokenForLogTest_bbbbbbbbbbbbbbbbbb";
let dir = "";
afterEach(() => {
  if (dir) {
    try { chmodSync(dir, 0o700); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
  dir = "";
});
const tmp = () => (dir = mkdtempSync(join(tmpdir(), "bot-squad-log-")));
const mode = (f: string) => statSync(f).mode & 0o777;

test("token disensor: mentah, ter-encode di URL, dan bentuk token lain", () => {
  const url = `https://api.telegram.org/bot${TOKEN}/getUpdates`;
  const enc = `https://x/bot${encodeURIComponent(TOKEN)}/getMe`;
  const other = "Error at 1234567:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef_-12";
  const out = redact(`${url} ${enc} ${other}`, [TOKEN]);
  expect(out).not.toContain(TOKEN);
  expect(out).not.toContain(encodeURIComponent(TOKEN));
  expect(out).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef");
  expect(out).toContain("/bot<token>/getUpdates");

  // Error grammY yang membungkus error fetch berisi URL dengan token.
  const inner = Object.assign(new TypeError(`fetch failed for ${url}`), { code: "ECONNRESET" });
  const http = Object.assign(new Error("Network request for 'getUpdates' failed!"), { name: "HttpError", error: inner });
  const d = describeError(http);
  expect(d).toContain("HttpError: Network request for 'getUpdates' failed! <- TypeError");
  expect(d).toContain("(ECONNRESET)");
  const f = join(tmp(), "plugin.log");
  createPluginLog({ file: f, secrets: [TOKEN] })("getUpdates-gagal", { alasan: JSON.stringify(d), stack: JSON.stringify(inner.stack ?? "") });
  const text = readFileSync(f, "utf8");
  expect(text).toContain("getUpdates-gagal");
  expect(text).not.toContain(TOKEN);
  expect(text.split("\n").length).toBe(2); // satu baris + akhir baris
});

test("isoLocal memuat zona waktu dan milidetik", () => {
  expect(isoLocal(Date.UTC(2026, 10, 12, 15, 0, 0, 7))).toMatch(/^2026-11-1\dT\d\d:\d\d:00\.007[+-]\d\d:\d\d$/);
});

test("file baru 0600, file lama yang longgar dikencangkan", () => {
  const f = join(tmp(), "plugin.log");
  createPluginLog({ file: f, secrets: [] })("a");
  expect(mode(f)).toBe(0o600);
  writeFileSync(f, "lama\n", { mode: 0o644 });
  chmodSync(f, 0o644);
  createPluginLog({ file: f, secrets: [] })("b");
  expect(mode(f)).toBe(0o600);
  expect(readFileSync(f, "utf8")).toMatch(/^lama\n.* b\n$/);
});

test("diputar sekali saat melewati batas; plugin.log.1 lama ditimpa", () => {
  const f = join(tmp(), "plugin.log");
  const log = createPluginLog({ file: f, secrets: [], maxBytes: 200 });
  const line = (i: number) => log("x", { i: String(i).padStart(4, "0"), pad: "y".repeat(40) });
  for (let i = 0; i < 4; i++) line(i); // 4 x ~76 byte > 200 -> sekali diputar
  expect(existsSync(`${f}.1`)).toBe(true);
  const first1 = readFileSync(`${f}.1`, "utf8");
  expect(first1).toContain("i=0000");
  for (let i = 4; i < 12; i++) line(i);
  const now1 = readFileSync(`${f}.1`, "utf8");
  expect(now1).not.toContain("i=0000"); // generasi lama ditimpa
  expect(existsSync(`${f}.2`)).toBe(false);
  expect(statSync(f).size).toBeLessThanOrEqual(200);
  expect(statSync(`${f}.1`).size).toBeLessThanOrEqual(200);
  expect(mode(f)).toBe(0o600);
  expect(mode(`${f}.1`)).toBe(0o600);
  // Tidak ada baris yang hilang di antara dua file terakhir.
  const all = (now1 + readFileSync(f, "utf8")).match(/i=\d+/g)!;
  expect(all.at(-1)).toBe("i=0011");
});

test("rotasi juga berlaku untuk file yang sudah besar dari proses sebelumnya", () => {
  const f = join(tmp(), "plugin.log");
  writeFileSync(f, "z".repeat(999_990) + "\n");
  createPluginLog({ file: f, secrets: [] })("baru", { pad: "y".repeat(20) });
  expect(statSync(`${f}.1`).size).toBe(999_991);
  expect(readFileSync(f, "utf8")).toMatch(/ baru pad=y+\n$/);
});

test("gagal menulis tidak melempar, diberitahu sekali, dan pulih", () => {
  const d = tmp();
  const f = join(d, "plugin.log");
  mkdirSync(f); // plugin.log berupa folder: append gagal (EISDIR)
  const errors: unknown[] = [];
  const log = createPluginLog({ file: f, secrets: [], onFirstError: (e) => errors.push(e) });
  expect(() => { log("a"); log("b"); log("c"); }).not.toThrow();
  expect(errors.length).toBe(1);
  rmSync(f, { recursive: true });
  log("d");
  expect(readFileSync(f, "utf8")).toMatch(/ d\n$/);

  // Folder tidak bisa ditulis.
  const ro = join(d, "ro");
  mkdirSync(ro);
  chmodSync(ro, 0o500);
  const log2 = createPluginLog({ file: join(ro, "plugin.log"), secrets: [], onFirstError: () => { throw new Error("x"); } });
  expect(() => log2("a")).not.toThrow();
  chmodSync(ro, 0o700);
});
