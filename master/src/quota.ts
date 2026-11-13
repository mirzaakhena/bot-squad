import { join } from "node:path";
import { readCapturedStatus, STATUS_FILE } from "../../plugin/context.ts";
import type { CapturedStatus } from "../../plugin/context-render.ts";
import { botPaths } from "./launch.ts";
import { describeError, redact, type Logger } from "./log.ts";
import { NAME_RULE } from "./register.ts";
import { readRegistry, RegistryError, type BotRecord } from "./registry.ts";

/**
 * /quota (tiket 261113192501): sisa kuota akun Claude dari rate_limits yang
 * sudah ditangkap bridge statusline tiap bot (<state>/status.json). Hanya
 * membaca registry.json dan status.json bot terdaftar; tidak ada berkas, sesi,
 * atau proses yang diubah, dan kredensial akun Claude tidak disentuh.
 *
 * Sumbernya SATU tangkapan (Q1): status.json dengan captured_at_ms paling baru
 * di antara bot terdaftar (apa pun statusnya) yang punya minimal satu jendela
 * rate_limits. Jendela 5 jam dan 7 hari diambil dari tangkapan itu saja.
 */

/** Umur data di atas ini diberi catatan basi (Q2). */
export const QUOTA_STALE_MS = 6 * 3600_000;

export const NO_QUOTA_DATA =
  "Belum ada data kuota akun Claude: belum ada bot terdaftar yang pernah menangkap batas pemakaian (5 jam/7 hari).\n\n" +
  "Data ini ditangkap baris status Claude Code di bot setelah bot dinyalakan dengan fitur /context dan menjawab pesan. " +
  "Kirim pesan ke bot mana saja, lalu coba /quota lagi. Bot yang dinyalakan sebelum fitur itu perlu dinyalakan ulang dulu dengan /restart.";

export const QUOTA_REGISTRY_BROKEN = "Kuota tidak bisa dibaca: registry.json rusak atau tidak terbaca. Lihat log master-bot.";

type Window = { used_percentage?: number; resets_at?: number };

/** Jendela yang berisi sesuatu yang bisa ditampilkan. */
function usable(w: unknown): w is Window {
  if (typeof w !== "object" || w === null) return false;
  const x = w as Window;
  return isNum(x.used_percentage) || isNum(x.resets_at);
}
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export type QuotaSource = { name: string; username: string; status: CapturedStatus };

/**
 * Tangkapan terbaru yang punya minimal satu jendela rate_limits, atau null.
 * status.json yang tidak ada dilewati diam-diam; yang rusak atau tak terbaca
 * dilewati dan dicatat di log (A1).
 */
export function pickQuotaSource(dataDir: string, bots: Record<string, BotRecord>, log: Logger): QuotaSource | null {
  let best: QuotaSource | null = null;
  for (const name of Object.keys(bots).sort()) {
    // Nama yang tidak sah tidak dipakai sebagai path.
    if (!NAME_RULE.test(name)) continue;
    const read = readCapturedStatus(join(botPaths(dataDir, name).state, STATUS_FILE));
    if (read.kind === "missing") continue;
    if (read.kind === "unreadable") {
      log(`/quota: status.json '${name}' dilewati: ${read.reason}`);
      continue;
    }
    const s = read.status;
    if (!isNum(s.captured_at_ms)) continue;
    const rl = s.payload.rate_limits;
    if (typeof rl !== "object" || rl === null || !(usable(rl.five_hour) || usable(rl.seven_day))) continue;
    if (best === null || s.captured_at_ms > best.status.captured_at_ms) {
      const u = (bots[name] as Partial<BotRecord>).username;
      best = { name, username: typeof u === "string" && u !== "" ? u : "?", status: s };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Format waktu: WIB (UTC+7 tanpa DST, sama dengan /context di chat bot).

const WIB_MS = 7 * 3600_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "HH:MM WIB", ditambah tanggal kalau bukan hari yang sama (WIB) dengan nowMs. */
export function wibTime(epochMs: number, nowMs: number): string {
  const d = new Date(epochMs + WIB_MS);
  const n = new Date(nowMs + WIB_MS);
  const hm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} WIB`;
  const sameDay =
    d.getUTCFullYear() === n.getUTCFullYear() && d.getUTCMonth() === n.getUTCMonth() && d.getUTCDate() === n.getUTCDate();
  if (sameDay) return hm;
  const year = d.getUTCFullYear() === n.getUTCFullYear() ? "" : ` ${d.getUTCFullYear()}`;
  return `${hm}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year}`;
}

/** Durasi dalam Bahasa Indonesia, dua satuan terbesar: "2 hari 3 jam", "45 menit". */
export function duration(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60_000);
  if (totalMin < 1) return "kurang dari 1 menit";
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return hours ? `${days} hari ${hours} jam` : `${days} hari`;
  if (hours > 0) return minutes ? `${hours} jam ${minutes} menit` : `${hours} jam`;
  return `${minutes} menit`;
}

/** Persen untuk tampilan: bulat kalau bulat, selain itu satu desimal. */
function pct(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",");
}

function windowLines(label: string, w: Window, nowMs: number): string {
  const resetMs = isNum(w.resets_at) ? w.resets_at * 1000 : null;
  if (resetMs !== null && resetMs <= nowMs) {
    return `<b>${label}</b>: sudah pulih, angka baru belum ada (pulih ${wibTime(resetMs, nowMs)})`;
  }
  const lines = [`<b>${label}</b>`];
  if (isNum(w.used_percentage)) {
    const used = Math.min(100, Math.max(0, w.used_percentage));
    lines.push(`   terpakai ${pct(used)}% · sisa ${pct(100 - used)}%`);
  } else {
    lines.push("   persen terpakai tidak ada di data");
  }
  lines.push(
    resetMs !== null
      ? `   pulih dalam ${duration(resetMs - nowMs)} (${wibTime(resetMs, nowMs)})`
      : "   waktu pulih tidak ada di data",
  );
  return lines.join("\n");
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Balasan /quota dari satu tangkapan (HTML). */
export function renderQuota(src: QuotaSource, nowMs: number): string {
  const rl = src.status.payload.rate_limits ?? {};
  const parts = ["<b>Kuota akun Claude</b>"];
  if (usable(rl.five_hour)) parts.push(windowLines("5 jam", rl.five_hour, nowMs));
  if (usable(rl.seven_day)) parts.push(windowLines("7 hari", rl.seven_day, nowMs));
  const at = src.status.captured_at_ms;
  const age = nowMs - at;
  let footer =
    `Data dari ${escapeHtml(src.name)} (@${escapeHtml(src.username)}), ` +
    `diperbarui ${age < 60_000 ? "baru saja" : `${duration(age)} lalu`} (${wibTime(at, nowMs)}).`;
  if (age > QUOTA_STALE_MS) footer += "\nMungkin basi; kirim pesan ke bot mana saja untuk memperbarui.";
  parts.push(footer);
  return parts.join("\n\n");
}

const ANY_TOKEN = /\d+:[A-Za-z0-9_-]{20,}/g;

/** Teks balasan /quota (HTML). Hanya membaca registry.json dan status.json. */
export function quotaReport(d: { dataDir: string; log: Logger; now: number }): string {
  let bots: Record<string, BotRecord>;
  try {
    bots = readRegistry(d.dataDir).bots;
  } catch (err) {
    d.log(`/quota: ${err instanceof RegistryError ? err.message : describeError(err)}`);
    return escapeHtml(QUOTA_REGISTRY_BROKEN);
  }
  const src = pickQuotaSource(d.dataDir, bots, d.log);
  if (!src) return escapeHtml(NO_QUOTA_DATA);
  return redact(renderQuota(src, d.now).replace(ANY_TOKEN, "&lt;token disembunyikan&gt;"), []);
}
