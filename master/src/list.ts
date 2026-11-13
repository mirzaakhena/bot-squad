import { readdirSync, readFileSync } from "node:fs";
import { botPaths, type Tmux } from "./launch.ts";
import { describeError, redact, type Logger } from "./log.ts";
import { NAME_RULE } from "./register.ts";
import { readRegistry, RegistryError, type BotRecord } from "./registry.ts";
import { accessCount, readAccess } from "./allow.ts";

/**
 * /list (tiket 261112225301): daftar bot terdaftar beserta keadaan nyatanya.
 * Hanya membaca: registry.json, folder bots/, sesi tmux, dan bot.pid. Tidak
 * ada sesi, proses, atau berkas yang diubah.
 */

/**
 * Keadaan nyata satu bot, dengan cek yang sama seperti runningReason di
 * launch.ts: sesi tmux '<nama>' dan proses di state/bot.pid.
 */
export type Liveness =
  | "alive" // sesi ada dan server plugin hidup
  | "plugin-dead" // sesi ada, server plugin mati atau belum menulis bot.pid
  | "plugin-only" // sesi tidak ada, tetapi server plugin masih hidup
  | "dead" // tidak ada sesi dan tidak ada server plugin
  | "unknown"; // tmux tidak bisa diperiksa

export type ProbeDeps = {
  dataDir: string;
  tmux: Pick<Tmux, "hasSession">;
  isAlive: (pid: number) => boolean;
};

function readPid(file: string): number | null {
  try {
    const pid = parseInt(readFileSync(file, "utf8"), 10);
    return pid > 1 ? pid : null;
  } catch {
    return null;
  }
}

export async function probeBot(name: string, d: ProbeDeps): Promise<Liveness> {
  let session: boolean;
  try {
    session = await d.tmux.hasSession(name);
  } catch {
    return "unknown";
  }
  const pid = readPid(botPaths(d.dataDir, name).pidFile);
  const plugin = pid !== null && d.isAlive(pid);
  if (session) return plugin ? "alive" : "plugin-dead";
  return plugin ? "plugin-only" : "dead";
}

const LIVENESS_TEXT: Record<Liveness, string> = {
  alive: "hidup",
  "plugin-dead": "sesi tmux ada, tetapi server plugin mati",
  "plugin-only": "sesi tmux tidak ada, tetapi server plugin masih hidup",
  dead: "mati",
  unknown: "tidak bisa diperiksa (tmux error)",
};

const STATUS_TEXT: Record<string, string> = {
  registered: "terdaftar",
  active: "aktif",
  failed: "gagal",
  stopped: "dihentikan",
};

/** Teks status tercatat; nilai yang tidak dikenal ditampilkan apa adanya. */
export function statusText(status: unknown): string {
  if (typeof status === "string" && Object.hasOwn(STATUS_TEXT, status)) return STATUS_TEXT[status]!;
  if (typeof status === "string" && status !== "") return status;
  return "(tidak ada)";
}

/**
 * Tanda tidak cocok antara status tercatat dan kenyataan (A3), atau null.
 * failed tidak pernah ditandai: penyalaan gagal sengaja membiarkan sesinya.
 */
export function mismatch(status: unknown, live: Liveness): string | null {
  if (live === "unknown") return null;
  if (status === "active" && live !== "alive") return "tercatat aktif, tetapi tidak benar-benar hidup";
  if (status === "registered" && live === "dead") return "tercatat terdaftar, tetapi tidak berjalan";
  if (status === "stopped" && live !== "dead") return "tercatat dihentikan, tetapi masih berjalan";
  return null;
}

/** Folder di bots/ (yang namanya sah) yang tidak ada di registry, urut nama. */
export function unregisteredFolders(dataDir: string, registered: Record<string, unknown>): string[] {
  let entries;
  try {
    entries = readdirSync(botPaths(dataDir, "x").botsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && NAME_RULE.test(e.name) && !Object.hasOwn(registered, e.name))
    .map((e) => e.name)
    .sort();
}

/** Jumlah orang yang punya akses ke bot (Q1, tiket 261112225307); hanya membaca access.json. */
export function accessLine(dataDir: string, name: string): string {
  const read = readAccess(dataDir, name);
  if (!read.ok) return "akses: tidak bisa dibaca (lihat /access " + name + ")";
  return `akses: ${accessCount(read.access)} orang`;
}

const ANY_TOKEN = /\d+:[A-Za-z0-9_-]{20,}/g;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const EMPTY_LIST =
  "Belum ada bot terdaftar.\n\nDaftarkan bot baru dengan /register <nama> <token>. " +
  "Buat bot-nya dulu di @BotFather untuk mendapatkan token.";

export const REGISTRY_BROKEN = "Daftar bot tidak bisa dibaca: registry.json rusak atau tidak terbaca. Lihat log master-bot.";

/**
 * Teks balasan /list (HTML). Hanya dirangkai dari nama folder yang lolos
 * aturan nama, username dan status dari registry (di-escape), dan teks tetap;
 * hasil akhirnya tetap disensor dari apa pun yang berbentuk token.
 */
export async function listReport(d: ProbeDeps & { log: Logger }): Promise<string> {
  let bots: Record<string, BotRecord>;
  try {
    bots = readRegistry(d.dataDir).bots;
  } catch (err) {
    d.log(`/list: ${err instanceof RegistryError ? err.message : describeError(err)}`);
    return REGISTRY_BROKEN;
  }
  const names = Object.keys(bots).sort();
  const strays = unregisteredFolders(d.dataDir, bots);

  const lines: string[] = [];
  if (names.length === 0) {
    lines.push(escapeHtml(EMPTY_LIST));
  } else {
    lines.push(`<b>Bot terdaftar (${names.length})</b>`);
    let bad = 0;
    for (const name of names) {
      const rec = (bots[name] ?? {}) as Partial<BotRecord>;
      const live = await probeBot(name, d);
      const user = typeof rec.username === "string" && rec.username !== "" ? `@${rec.username}` : "@?";
      const flag = NAME_RULE.test(name) ? mismatch(rec.status, live) : null;
      const shownLive = NAME_RULE.test(name) ? LIVENESS_TEXT[live] : "tidak diperiksa (nama tidak sah)";
      let line =
        `${flag ? "⚠️" : "•"} <b>${escapeHtml(name)}</b> ${escapeHtml(user)}\n` +
        `   tercatat: ${escapeHtml(statusText(rec.status))} · nyata: ${shownLive}`;
      if (flag) {
        bad++;
        line += `\n   TIDAK COCOK: ${flag}`;
      } else if (rec.status === "failed" && (live === "alive" || live === "plugin-dead")) {
        line += "\n   sesi dibiarkan untuk diperiksa";
      }
      if (NAME_RULE.test(name)) line += `\n   ${accessLine(d.dataDir, name)}`;
      lines.push(line);
    }
    if (bad > 0) lines.push(`${bad} bot tidak cocok antara status tercatat dan keadaan nyata.`);
  }

  if (strays.length > 0) {
    const out = [`<b>Tidak terdaftar, tidak dikelola master-bot (${strays.length})</b>`];
    for (const name of strays) {
      out.push(`• ${escapeHtml(name)}: ${LIVENESS_TEXT[await probeBot(name, d)]}`);
    }
    lines.push(out.join("\n"));
  }
  // Lebih longgar dari redact() (ID bot pendek pun ikut; username dan status
  // yang sah tidak pernah memuat ':'), dan penggantinya sudah di-escape.
  return redact(lines.join("\n\n").replace(ANY_TOKEN, "&lt;token disembunyikan&gt;"), []);
}
