import { probeBot, type ProbeDeps } from "./list.ts";
import { describeError, type Logger } from "./log.ts";
import { logsReport, LOGS_DEFAULT_LINES, type LogsDeps } from "./logs.ts";

/**
 * /keys <nama> <tombol> [<tombol> ...] (tiket 261115195101): mengirim tombol
 * ke sesi tmux satu bot, misalnya untuk menjawab dialog Claude Code, lalu
 * menampilkan layar sesudahnya.
 *
 * Keputusan pemilik (2026-11-15): daftar tombol tertutup, tanpa teks bebas
 * dan tanpa ctrl-c. Kata dari pemilik tidak pernah diteruskan ke tmux: yang
 * dikirim hanya argumen tetap dari KEYS di bawah.
 */

export const KEYS_MAX = 20;
/** Jeda antartombol, supaya layar Claude Code sempat mengikuti. */
export const KEYS_GAP_MS = 200;
/** Jeda setelah tombol terakhir sebelum layar dibaca. */
export const KEYS_SETTLE_MS = 1000;

const literal = (ch: string) => ["-l", ch] as const;

/**
 * Daftar tertutup: nama tombol di perintah -> argumen `tmux send-keys`.
 * Tombol bernama dikirim sebagai nama tombol tmux; angka dan huruf dikirim
 * harfiah (-l), jadi tidak pernah ditafsirkan tmux sebagai nama tombol.
 */
const KEYS = {
  up: ["Up"],
  down: ["Down"],
  left: ["Left"],
  right: ["Right"],
  enter: ["Enter"],
  esc: ["Escape"],
  tab: ["Tab"],
  space: ["Space"],
  backspace: ["BSpace"],
  "0": literal("0"),
  "1": literal("1"),
  "2": literal("2"),
  "3": literal("3"),
  "4": literal("4"),
  "5": literal("5"),
  "6": literal("6"),
  "7": literal("7"),
  "8": literal("8"),
  "9": literal("9"),
  y: literal("y"),
  n: literal("n"),
} as const satisfies Record<string, readonly string[]>;

export type KeyName = keyof typeof KEYS;
export const KEY_NAMES = Object.keys(KEYS) as KeyName[];

/** Argumen `tmux send-keys` (setelah target) untuk satu tombol di daftar. */
export const tmuxKeyArgs = (key: KeyName): readonly string[] => KEYS[key];

export const KEYS_USAGE =
  "Cara pakai: /keys <nama> <tombol> [<tombol> ...]\n" +
  `Tombol (1-${KEYS_MAX} per perintah, dipisah spasi): up, down, left, right, enter, esc, tab, space, backspace, angka 0-9, y, n.\n` +
  "Tombol lain, teks bebas, dan ctrl-c tidak diterima; kalau ada satu saja yang salah, tidak ada tombol yang dikirim.\n" +
  "Contoh: /keys bot-01 down enter\n" +
  "Nama hanya huruf kecil, angka, dan '-'.";

/**
 * Argumen /keys: nama (belum dicek aturan nama) dan tombol dalam urutan yang
 * ditulis, atau null kalau salah bentuk (tanpa tombol, lebih dari KEYS_MAX,
 * atau ada kata di luar daftar). Huruf besar-kecil tombol tidak dibedakan.
 */
export function parseKeysArgs(match: unknown): { name: string; keys: KeyName[] } | null {
  const words = (typeof match === "string" ? match : "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 1 + KEYS_MAX) return null;
  const keys: KeyName[] = [];
  for (const w of words.slice(1)) {
    const k = w.toLowerCase();
    if (!Object.hasOwn(KEYS, k)) return null;
    keys.push(k as KeyName);
  }
  return { name: words[0]!, keys };
}

/**
 * Mengirim satu tombol ke sesi tmux `name` (target persis, `=<nama>:`).
 * false kalau tmux menolak, misalnya sesinya sudah tidak ada.
 */
export async function realSendKey(name: string, key: KeyName): Promise<boolean> {
  const p = Bun.spawn(["tmux", "send-keys", "-t", `=${name}:`, ...tmuxKeyArgs(key)], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  return (await p.exited) === 0;
}

export type KeysDeps = LogsDeps & {
  sendKey: (name: string, key: KeyName) => Promise<boolean>;
  /** Harus selesai lebih awal kalau signal dibatalkan. */
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Dibatalkan saat master-bot berhenti: tombol yang belum dikirim tidak dikirim. */
  signal?: AbortSignal;
  gapMs?: number;
  settleMs?: number;
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Mengirim tombol ke bot yang sudah dipastikan terdaftar dan tidak sedang
 * diproses, lalu mengembalikan balasan (HTML): tombol yang dikirim dan layar
 * sesudahnya dengan aturan /logs. Kalau sesi tmux-nya tidak ada, tidak ada
 * tombol yang dikirim.
 */
export async function sendKeysAndReport(name: string, username: string, keys: readonly KeyName[], d: KeysDeps): Promise<string> {
  const who = `@${escapeHtml(username)} ('${name}')`;
  const probe: ProbeDeps = { dataDir: d.dataDir, tmux: d.tmux, isAlive: d.isAlive, log: d.log };
  const live = await probeBot(name, probe);
  if (live === "unknown") return `Tidak ada tombol yang dikirim ke ${who}: tmux tidak bisa diperiksa. Lihat log master-bot.`;
  if (live === "dead" || live === "plugin-only") {
    const how = live === "dead" ? "mati" : "sesi tmux tidak ada, tetapi server plugin masih hidup";
    return `Bot ${who} tidak hidup (${how}), jadi tidak ada tombol yang dikirim. Nyalakan dengan /restart ${name}.`;
  }

  const sent: KeyName[] = [];
  let problem = "";
  for (const key of keys) {
    if (d.signal?.aborted) {
      problem = "master-bot berhenti";
      break;
    }
    if (sent.length > 0) await d.sleep(d.gapMs ?? KEYS_GAP_MS, d.signal);
    if (d.signal?.aborted) {
      problem = "master-bot berhenti";
      break;
    }
    let ok = false;
    try {
      ok = await d.sendKey(name, key);
    } catch (err) {
      d.log(`/keys '${name}': tombol '${key}' gagal dikirim: ${describeError(err)}`);
    }
    if (!ok) {
      problem = `tombol ke-${sent.length + 1} (${key}) ditolak tmux; sesi tmux-nya mungkin baru saja hilang`;
      break;
    }
    sent.push(key);
  }
  d.log(`/keys '${name}': ${sent.length} dari ${keys.length} tombol dikirim${sent.length > 0 ? ` (${sent.join(" ")})` : ""}`);

  const head =
    problem === ""
      ? `Tombol dikirim ke ${who}: ${sent.join(" ")}`
      : sent.length === 0
        ? `Tidak ada tombol yang dikirim ke ${who}: ${problem}.`
        : `Hanya ${sent.length} dari ${keys.length} tombol yang dikirim ke ${who}: ${sent.join(" ")}\nBerhenti karena ${problem}.`;
  if (d.signal?.aborted) return head;

  if (sent.length > 0) await d.sleep(d.settleMs ?? KEYS_SETTLE_MS, d.signal);
  // Layar sesudahnya: tampilan dan sensor token sama persis dengan /logs.
  const screen = await logsReport(name, username, LOGS_DEFAULT_LINES, { ...d, budget: 4000 - head.length - 2 });
  return `${head}\n\n${screen}`;
}
