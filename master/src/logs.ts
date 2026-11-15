import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { botPaths, type Tmux } from "./launch.ts";
import { probeBot, type Liveness } from "./list.ts";
import { describeError, redact, type Logger } from "./log.ts";

/**
 * /logs <nama> [n] (tiket 261112225303): baris-baris terakhir layar sesi tmux
 * satu bot. Hanya membaca: tmux has-session, capture-pane, dan bot.pid.
 */

export const LOGS_DEFAULT_LINES = 20;
export const LOGS_MAX_LINES = 50;
/** Batas panjang satu pesan Telegram. */
export const TELEGRAM_MAX_CHARS = 4096;
/**
 * Batas panjang balasan, dihitung pada teks HTML mentah (setelah escape,
 * sebelum Telegram mengurai tag), jadi selalu di bawah 4096 apa pun cara
 * Telegram menghitungnya.
 */
const DEFAULT_REPLY_BUDGET = 4000;

export const LOGS_USAGE =
  `Cara pakai: /logs <nama> [n]\n` +
  `n = jumlah baris terakhir layar, 1-${LOGS_MAX_LINES} (default ${LOGS_DEFAULT_LINES}).\n` +
  "Nama hanya huruf kecil, angka, dan '-'.";

/** Argumen /logs: nama (belum dicek aturan nama) dan jumlah baris, atau null kalau salah bentuk. */
export function parseLogsArgs(match: unknown): { name: string; lines: number } | null {
  const words = (typeof match === "string" ? match : "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 2) return null;
  let lines = LOGS_DEFAULT_LINES;
  if (words.length === 2) {
    if (!/^\d{1,3}$/.test(words[1]!)) return null;
    lines = Number(words[1]);
    if (lines < 1 || lines > LOGS_MAX_LINES) return null;
  }
  return { name: words[0]!, lines };
}

const MASK = "<token disembunyikan>";
/**
 * Calon token: <angka>:<karakter token>. Disensor kalau bagian setelah ':'
 * minimal 20 karakter (lebih longgar dari log.ts, sama dengan /list).
 */
const TOKEN_LIKE = /\d+:[A-Za-z0-9_-]+/g;
/** Potongan rahasia yang diketahui sepanjang ini atau lebih ikut disensor. */
export const FRAGMENT_MIN = 8;
/** Panjang bagian token Telegram setelah ':'. */
const TOKEN_TAIL = 35;
/** Nilai variabel token di baris mana pun: KEY=nilai, KEY: nilai, "KEY": "nilai". */
const TOKEN_ASSIGN = /(TELEGRAM_BOT_TOKEN|MASTER_BOT_TOKEN)["']?\s*[=:]\s*/g;

/** Nilai-nilai di berkas .env (semua baris KEY=VALUE), untuk disensor. */
export function envValues(file: string): string[] {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const v = m[1]!.trim().replace(/^(["'])(.*)\1$/, "$2");
    // Nilai pendek (misalnya angka kecil) tidak disensor supaya layar tetap terbaca.
    if (v.length >= 8) out.push(v);
  }
  return out;
}

/** Nilai .env semua folder bots/<nama>/state selain bot ini. */
function otherBotSecrets(dataDir: string, self: string): string[] {
  let names: string[];
  try {
    names = readdirSync(botPaths(dataDir, self).botsDir);
  } catch {
    return [];
  }
  return names.filter((n) => n !== self).flatMap((n) => envValues(join(botPaths(dataDir, n).state, ".env")));
}

/**
 * Menyensor rahasia dari baris-baris layar. Pencarian dilakukan pada teks yang
 * barisnya disambung (spasi di sekitar patahan baris diabaikan), jadi token
 * yang terpotong ke dua baris layar tetap tertangkap di kedua baris.
 */
export function maskScreen(lines: readonly string[], secrets: readonly string[]): string[] {
  let joined = "";
  const where: Array<[number, number]> = []; // indeks di joined -> [baris, kolom]
  lines.forEach((line, li) => {
    const start = li === 0 ? 0 : line.length - line.trimStart().length;
    const end = line.trimEnd().length;
    for (let c = start; c < end; c++) {
      joined += line[c];
      where.push([li, c]);
    }
  });
  const hidden = new Set<number>();
  const hide = (from: number, to: number) => {
    for (let i = from; i < to; i++) hidden.add(i);
  };
  const variants = new Set<string>();
  for (const s of secrets) {
    if (!s) continue;
    variants.add(s);
    variants.add(encodeURIComponent(s));
  }
  for (const v of variants) {
    for (let at = joined.indexOf(v); at !== -1; at = joined.indexOf(v, at + 1)) hide(at, at + v.length);
  }
  // Potongan rahasia yang diketahui: layar bisa hanya memuat sebagian token
  // (baris teratas adalah lanjutan wrap dari scrollback, awalan sebelum
  // elipsis, token yang dipisah bingkai). Setiap potongan sepanjang
  // FRAGMENT_MIN atau lebih tertutup oleh jendela-jendela FRAGMENT_MIN-nya.
  const grams = new Set<string>();
  for (const v of variants) {
    for (let i = 0; i + FRAGMENT_MIN <= v.length; i++) grams.add(v.slice(i, i + FRAGMENT_MIN));
  }
  for (let i = 0; i + FRAGMENT_MIN <= joined.length; i++) {
    if (grams.has(joined.slice(i, i + FRAGMENT_MIN))) hide(i, i + FRAGMENT_MIN);
  }
  for (const m of joined.matchAll(TOKEN_LIKE)) {
    const a = m.index!;
    const colon = a + m[0].indexOf(":");
    const b = a + m[0].length;
    if (b - colon - 1 < 20) continue;
    // Yang menyeberang ke baris berikutnya hanya diteruskan sampai panjang
    // token Telegram (35 karakter setelah ':'), supaya kata di awal baris
    // berikutnya tidak ikut tersembunyi.
    let firstLine = colon + 1;
    while (firstLine < b && where[firstLine]![0] === where[a]![0]) firstLine++;
    hide(a, Math.min(b, Math.max(firstLine, colon + 1 + TOKEN_TAIL)));
  }
  for (const m of joined.matchAll(TOKEN_ASSIGN)) {
    const from = m.index! + m[0].length;
    // Sampai spasi pertama atau ujung baris. Token yang patah ke baris
    // berikutnya tetap tertangkap lewat token yang diketahui dan TOKEN_LIKE.
    let to = from;
    while (to < joined.length && !/\s/.test(joined[to]!) && where[to]![0] === where[from]?.[0]) to++;
    hide(from, to);
  }

  // Bangun ulang tiap baris; setiap rentang tersensor menjadi satu penanda.
  const hiddenCols = lines.map(() => new Set<number>());
  for (const i of hidden) hiddenCols[where[i]![0]]!.add(where[i]![1]);
  return lines.map((line, li) => {
    const cols = hiddenCols[li]!;
    if (cols.size === 0) return redact(line, secrets);
    let out = "";
    let inMask = false;
    for (let c = 0; c < line.length; c++) {
      if (cols.has(c)) {
        if (!inMask) out += MASK;
        inMask = true;
      } else {
        out += line[c];
        inMask = false;
      }
    }
    return redact(out, secrets);
  });
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const LIVENESS_TEXT: Record<Liveness, string> = {
  alive: "hidup",
  "plugin-dead": "sesi tmux ada, tetapi server plugin mati",
  "plugin-only": "sesi tmux tidak ada, tetapi server plugin masih hidup",
  dead: "mati",
  unknown: "tidak bisa diperiksa (tmux error)",
};

export type LogsDeps = {
  dataDir: string;
  tmux: Pick<Tmux, "hasSession" | "capture">;
  isAlive: (pid: number) => boolean;
  /** Token master-bot; ikut disensor. */
  masterToken: string;
  log: Logger;
  /** Batas panjang balasan (teks HTML mentah); default REPLY_BUDGET. Dipakai /keys yang menambah kepala. */
  budget?: number;
};

/**
 * Balasan /logs (HTML) untuk bot yang sudah dipastikan terdaftar. Selalu muat
 * satu pesan: kalau baris yang diminta terlalu panjang, baris teratas dibuang
 * dan balasan menyebutnya.
 */
export async function logsReport(name: string, username: string, wanted: number, d: LogsDeps): Promise<string> {
  const who = `@${escapeHtml(username)} ('${name}')`;
  const live = await probeBot(name, d);
  if (live === "unknown") return `Layar ${who} tidak bisa dibaca: tmux tidak bisa diperiksa. Lihat log master-bot.`;
  if (live === "dead" || live === "plugin-only") {
    return `Bot ${who} tidak hidup (${LIVENESS_TEXT[live]}), jadi tidak ada layar untuk ditampilkan. Nyalakan dengan /restart ${name}.`;
  }

  let pane: string | null;
  try {
    pane = await d.tmux.capture(name);
  } catch (err) {
    d.log(`/logs '${name}': layar gagal dibaca: ${describeError(err)}`);
    pane = null;
  }
  if (pane === null) return `Layar ${who} tidak bisa dibaca: sesi tmux-nya baru saja hilang atau tmux error.`;

  // Token bot ini, token master-bot, dan token bot lain (layar bisa
  // menampilkan .env bot lain, misalnya lewat cat).
  const secrets = [d.masterToken, ...envValues(join(botPaths(d.dataDir, name).state, ".env")), ...otherBotSecrets(d.dataDir, name)];
  const all = pane.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
  const lines = maskScreen(all, secrets).slice(-wanted);

  const note = live === "plugin-dead" ? "\n\nCatatan: sesi tmux ada, tetapi server plugin mati." : "";
  const head = (shown: number) =>
    lines.length === 0
      ? `Layar ${who} kosong.`
      : shown === lines.length
        ? `Layar ${who}, ${shown} baris terakhir:`
        : `Layar ${who}, ${shown} baris terakhir (diminta ${wanted}; baris teratas dibuang supaya muat satu pesan):`;
  const render = (shown: string[]) =>
    lines.length === 0 ? head(0) + note : `${head(shown.length)}\n<pre>${escapeHtml(shown.join("\n"))}</pre>${note}`;

  const REPLY_BUDGET = d.budget ?? DEFAULT_REPLY_BUDGET;
  let shown = [...lines];
  let text = render(shown);
  while (shown.length > 1 && text.length > REPLY_BUDGET) {
    shown.shift();
    text = render(shown);
  }
  // Satu baris yang terlalu panjang: ambil ujungnya.
  while (text.length > REPLY_BUDGET && shown[0]!.length > 0) {
    shown = [shown[0]!.slice(text.length - REPLY_BUDGET)];
    text = render(shown);
  }
  return text;
}
