import { Bot, type ApiClientOptions } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { isOwnerUpdate, senderIdForLog } from "./access.ts";
import { describeError, type Logger } from "./log.ts";
import { NAME_RULE, parseRegisterArgs, registerBot, USAGE } from "./register.ts";
import { readRegistry, setBotStatus, type BotStatus, type WriteHooks } from "./registry.ts";
import { conversationNote, isAlive, realTmux, type ConversationMode, type LaunchResult } from "./launch.ts";
import { listReport, type ProbeDeps } from "./list.ts";
import { LOGS_DEFAULT_LINES, LOGS_USAGE, logsReport, parseLogsArgs } from "./logs.ts";
import { KEYS_USAGE, parseKeysArgs, realSendKey, sendKeysAndReport, type KeyName } from "./keys.ts";
import { quotaReport } from "./quota.ts";
import { busyText, createBotLocks, type BotLocks } from "./busy.ts";
import { isClean, type StopResult } from "./stop.ts";
import { sendWithRetry, type RetryPolicy } from "./retry.ts";
import {
  ACCESS_USAGE,
  accessText,
  ALLOW_USAGE,
  allowWarning,
  changeAccess,
  isUserId,
  policyNote,
  readAccess,
  REVOKE_USAGE,
  type AccessWriteHooks,
} from "./allow.ts";
import { randomBytes } from "node:crypto";
import { archiveBot, markStoppedForDelete, type ArchiveResult } from "./delete.ts";
import { createPicker, PICK_DATA, type PickCommand } from "./picker.ts";

/** Perintah yang sudah berfungsi. Daftar ini juga menjadi menu perintah (lihat menu.ts). */
export const COMMANDS = [
  { command: "help", description: "Tampilkan daftar perintah" },
  { command: "register", description: "Daftarkan bot baru: /register <nama> <token>" },
  { command: "list", description: "Daftar bot beserta keadaan nyatanya" },
  { command: "stop", description: "Hentikan satu bot: /stop <nama>" },
  { command: "restart", description: "Nyalakan ulang satu bot, percakapan dilanjutkan: /restart <nama>" },
  { command: "new", description: "Mulai percakapan baru di satu bot (dengan konfirmasi): /new <nama>" },
  { command: "logs", description: "Baris terakhir layar satu bot: /logs <nama> [n]" },
  { command: "keys", description: "Kirim tombol ke sesi satu bot: /keys <nama> <tombol...>" },
  { command: "quota", description: "Sisa kuota akun Claude (5 jam/7 hari)" },
  { command: "allow", description: "Izinkan orang lain memakai satu bot: /allow <nama> <user_id>" },
  { command: "revoke", description: "Cabut akses orang lain ke satu bot: /revoke <nama> <user_id>" },
  { command: "access", description: "Siapa saja yang punya akses ke satu bot: /access <nama>" },
  { command: "delete", description: "Hapus satu bot (dengan konfirmasi): /delete <nama>" },
] as const;

/** Catatan /help tentang pemilih bot (tiket 261115202403). */
export const HELP_PICKER_NOTE =
  "Nama boleh dikosongkan untuk /stop, /restart, /new, /logs, /access, /delete, dan /revoke: " +
  "master-bot menampilkan bot terdaftar sebagai tombol (untuk /revoke, lalu user_id-nya). " +
  "Perintah lain tetap diketik lengkap.";

export function helpText(): string {
  return [
    "master-bot: panel kontrol bot-squad.",
    "",
    "Perintah yang tersedia:",
    ...COMMANDS.map((c) => `/${c.command} - ${c.description}`),
    "",
    HELP_PICKER_NOTE,
  ].join("\n");
}

export type MasterBotOptions = {
  token: string;
  ownerId: number;
  log: Logger;
  client?: ApiClientOptions;
  /** Folder data bot-squad (registry.json dan bots/). */
  dataDir: string;
  /** Diisi di tes supaya tidak perlu getMe. */
  botInfo?: UserFromGetMe;
  /** Batas waktu getMe untuk token bot baru; default 10 detik. */
  getMeTimeoutMs?: number;
  /** Kait untuk tes penulisan registry. */
  registryHooks?: WriteHooks;
  /**
   * Menyalakan satu bot (asli: launchBot dengan realLaunchDeps). `mode`:
   * "new" untuk /register dan /new <nama>, "continue" untuk /restart <nama>.
   */
  launch: (name: string, mode: ConversationMode) => Promise<LaunchResult>;
  /**
   * Kunci "sedang diproses" per bot; default kunci baru untuk master-bot ini.
   * Pekerjaan lain yang menyalakan atau menghentikan bot harus memakai yang sama.
   */
  locks?: BotLocks;
  /** Mematikan satu bot (asli: stopBot dengan realStopDeps). */
  stop: (name: string) => Promise<StopResult>;
  /**
   * Dipanggil dengan setiap pekerjaan di latar belakang (penyalaan, /stop,
   * /restart); dipakai tes dan main.ts untuk menunggunya.
   */
  onLaunch?: (done: Promise<void>) => void;
  /** Dibatalkan saat master-bot berhenti: percobaan kirim ulang laporan dihentikan. */
  signal?: AbortSignal;
  /** Cek keadaan nyata untuk /list; default tmux dan cek pid asli. Diganti di tes. */
  probe?: Omit<ProbeDeps, "dataDir">;
  /** Membaca layar sesi tmux untuk /logs; default realTmux.capture. Diganti di tes. */
  capture?: (name: string) => Promise<string | null>;
  /** Mengirim satu tombol ke sesi tmux untuk /keys; default realSendKey. Diganti di tes. */
  sendKey?: (name: string, key: KeyName) => Promise<boolean>;
  /** Jeda /keys (antartombol dan sebelum layar dibaca); diganti di tes. */
  keysTiming?: { gapMs?: number; settleMs?: number };
  /** Jeda kirim ulang laporan penyalaan; diganti di tes. */
  reportRetry?: RetryPolicy;
  /** Kait untuk tes penulisan access.json (/allow, /revoke). */
  accessHooks?: AccessWriteHooks;
  /** Jam untuk masa berlaku tombol konfirmasi (/delete, /new) dan cap waktu arsip; diganti di tes. */
  now?: () => number;
  /** Masa berlaku tombol konfirmasi /delete dan /new; default DELETE_CONFIRM_MS. */
  deleteConfirmMs?: number;
  /** Kait tes /delete: dipanggil tepat sebelum folder bot dipindah ke arsip. */
  beforeArchive?: (from: string, to: string) => void;
};

/** Tombol konfirmasi (/delete, /new) berlaku 5 menit dan hanya sekali pakai (A1). */
export const DELETE_CONFIRM_MS = 5 * 60_000;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const STATUS_NOT_RECORDED = "Status di registry gagal dicatat; lihat log master-bot.";

/**
 * Pesan hasil penyalaan bot untuk pemilik (HTML). statusRecorded false berarti
 * status active/failed gagal ditulis ke registry.
 */
export function launchReport(
  name: string,
  username: string,
  res: LaunchResult,
  statusRecorded = true,
  /** Mode yang diminta /restart ("continue") atau /new ("new"); null (untuk /register) berarti percakapan tidak disebut. */
  mode: ConversationMode | null = null,
): string {
  const who = `@${escapeHtml(username)} ('${name}')`;
  if (res.kind === "active") {
    let text = `Bot ${who} aktif. Silakan ajak bicara.`;
    if (mode !== null) {
      const conversation = res.conversation ?? (mode === "continue" ? { kind: "continued" as const } : { kind: "new" as const, why: "requested" as const });
      text += `\n\n${escapeHtml(conversationNote(conversation))}`;
      if (conversation.kind === "new" && conversation.why === "continue-failed") text += " Lihat log master-bot.";
    }
    return statusRecorded ? text : `${text}\n\n${STATUS_NOT_RECORDED}`;
  }
  if (res.kind === "already-running") {
    return `Bot ${who} tidak dinyalakan: ${escapeHtml(res.reason)}. Satu bot tidak boleh berjalan dua kali.`;
  }
  const parts = [`Bot ${who} gagal dinyalakan: ${escapeHtml(res.reason)}.`];
  if (res.screen) parts.push(`Isi layar terakhir:\n<pre>${escapeHtml(res.screen)}</pre>`);
  parts.push(
    res.sessionAlive
      ? `Lihat langsung di server: <code>tmux attach -t ${name}</code>`
      : "Sesi tmux-nya sudah tidak ada.",
  );
  const retry = `Coba lagi dengan /restart ${name}`;
  parts.push(statusRecorded ? `Status tercatat 'failed'. ${retry}.` : `${STATUS_NOT_RECORDED} ${retry}.`);
  return parts.join("\n\n");
}

/** Bagian peringatan /stop: apa yang masih hidup dan harus dicek manual. */
function leftoverLines(name: string, r: StopResult): string[] {
  const out: string[] = [];
  if (r.sessionLeft) out.push(`sesi tmux '${name}' masih hidup`);
  if (r.pidsLeft.length > 0) out.push(`server plugin masih hidup: pid ${r.pidsLeft.join(", ")}`);
  if (r.error !== undefined) out.push(`tmux atau daftar proses tidak bisa diperiksa (${escapeHtml(r.error)})`);
  return out;
}

/** Pesan hasil /stop untuk pemilik (HTML). */
export function stopReport(name: string, username: string, r: StopResult, statusRecorded = true): string {
  const who = `@${escapeHtml(username)} ('${name}')`;
  const parts = [r.wasRunning ? `Bot ${who} dihentikan.` : `Bot ${who} memang sudah tidak berjalan.`];
  const forced = r.killed.filter((k) => !r.pidsLeft.includes(k.pid));
  if (forced.length > 0) {
    parts.push(`Server plugin yang tidak keluar sendiri dimatikan paksa: ${forced.map((k) => `pid ${k.pid} (${k.signal})`).join(", ")}.`);
  }
  const left = leftoverLines(name, r);
  if (left.length > 0) {
    parts.push(`Peringatan: '${name}' tidak bersih dihentikan: ${left.join("; ")}. Periksa manual di server.`);
  }
  if (r.unrecognizedPid !== undefined) {
    parts.push(
      `Catatan: bot.pid menunjuk pid ${r.unrecognizedPid} yang masih hidup tetapi tidak dikenali sebagai server plugin '${name}', jadi tidak dimatikan. Periksa manual di server.`,
    );
  }
  parts.push(
    statusRecorded
      ? `Status tercatat 'stopped'. Nyalakan lagi dengan /restart ${name}.`
      : `${STATUS_NOT_RECORDED} Nyalakan lagi dengan /restart ${name}.`,
  );
  return parts.join("\n\n");
}

/** Pesan /restart yang batal karena bot lama tidak bisa dimatikan bersih (HTML). */
export function restartBlockedReport(name: string, username: string, r: StopResult): string {
  const who = `@${escapeHtml(username)} ('${name}')`;
  return (
    `Bot ${who} tidak dinyalakan ulang: bot lama tidak bisa dimatikan bersih (${leftoverLines(name, r).join("; ")}). ` +
    `Satu bot tidak boleh berjalan dua kali. Periksa manual di server. Status tidak diubah.`
  );
}

export const STOP_USAGE = "Cara pakai: /stop <nama>\nNama hanya huruf kecil, angka, dan '-'.";
export const RESTART_USAGE =
  "Cara pakai: /restart <nama>\nNama hanya huruf kecil, angka, dan '-'.\n" +
  "Percakapan terakhir bot dilanjutkan. Untuk percakapan baru: /new <nama>";
export const NEW_USAGE =
  "Cara pakai: /new <nama>\nNama hanya huruf kecil, angka, dan '-'.\n" +
  "Bot dinyalakan ulang dengan percakapan kosong, setelah dikonfirmasi. Untuk melanjutkan percakapan terakhir: /restart <nama>";
export const NEW_EXPIRED = "Konfirmasi ini sudah kedaluwarsa atau sudah dipakai. Tidak ada yang diubah. Kirim /new <nama> lagi kalau masih perlu.";

/** Pertanyaan konfirmasi /new (HTML). */
export function newQuestion(name: string, username: string): string {
  return (
    `Mulai percakapan baru di bot @${escapeHtml(username)} ('${name}')?\n\n` +
    `Bot dinyalakan ulang dan mulai dari percakapan kosong: ia tidak ingat percakapan sebelumnya. ` +
    `Percakapan lama tidak dihapus dari server. Untuk menyalakan ulang sambil melanjutkan percakapan terakhir, pakai /restart ${name}.\n\n` +
    `Tombol berlaku 5 menit.`
  );
}

/** Balasan pertama /restart dan /new (setelah dikonfirmasi): menyebut percakapan mana yang akan dipakai. */
export function restartingText(name: string, mode: ConversationMode): string {
  return mode === "continue"
    ? `Menyalakan ulang '${name}', melanjutkan percakapan terakhir...\nUntuk percakapan baru: /new ${name}`
    : `Menyalakan ulang '${name}' dengan percakapan baru...`;
}
export const DELETE_USAGE = "Cara pakai: /delete <nama>\nNama hanya huruf kecil, angka, dan '-'.";
export const DELETE_EXPIRED = "Konfirmasi ini sudah kedaluwarsa atau sudah dipakai. Tidak ada yang diubah. Kirim /delete <nama> lagi kalau masih perlu.";

/** Pertanyaan konfirmasi /delete (HTML). */
export function deleteQuestion(name: string, username: string): string {
  return (
    `Hapus bot @${escapeHtml(username)} ('${name}')?\n\n` +
    `Bot dimatikan, dihapus dari daftar bot, dan seluruh foldernya (workspace dan state) dipindah ke arsip. ` +
    `Token bot dihapus dan tidak ikut diarsipkan. Langkah ini tidak bisa dibatalkan dari master-bot.\n\n` +
    `Tombol berlaku 5 menit.`
  );
}

/** Laporan /delete yang batal karena status 'stopped' gagal dicatat (HTML, Q1 tiket 261113190701). */
export function deleteNotMarkedReport(name: string, username: string, reason: string): string {
  return (
    `Bot @${escapeHtml(username)} ('${name}') tidak dihapus: status 'stopped' gagal dicatat di daftar bot (${escapeHtml(reason)}). ` +
    `Tidak ada yang diubah: bot tidak dihentikan, folder dan daftar bot tetap. Lihat log master-bot, lalu coba /delete ${name} lagi.`
  );
}

/** Laporan hasil /delete (HTML). Status 'stopped' sudah tercatat sebelum bot dihentikan. */
export function deleteReport(name: string, username: string, stop: StopResult, res: ArchiveResult): string {
  const who = `@${escapeHtml(username)} ('${name}')`;
  if (!isClean(stop)) {
    return (
      `Bot ${who} tidak dihapus: bot tidak bisa dimatikan bersih (${leftoverLines(name, stop).join("; ")}). ` +
      `Folder dan entri di daftar bot tidak diubah, tetapi status tercatat 'stopped', jadi bot ini tidak dinyalakan otomatis. ` +
      `Periksa manual di server, lalu nyalakan lagi dengan /restart ${name} atau coba hapus lagi dengan /delete ${name}.`
    );
  }
  if (!res.ok) {
    const parts = [`Bot ${who} gagal dihapus: ${escapeHtml(res.reason)}.`];
    if (res.archivedTo) {
      parts.push(`Folder sudah dipindah ke arsip: <code>${escapeHtml(res.archivedTo)}</code>, tetapi '${name}' masih ada di daftar bot. Coba /delete ${name} lagi.`);
    } else if (res.tokenRemoved) {
      parts.push(`Token di state/.env sudah dihapus, jadi bot ini tidak bisa dinyalakan lagi. Folder masih di tempatnya dan '${name}' masih terdaftar. Coba /delete ${name} lagi.`);
    } else {
      parts.push(`Folder dan entri di daftar bot tidak diubah; status tercatat 'stopped'. Nyalakan lagi dengan /restart ${name} atau coba /delete ${name} lagi.`);
    }
    parts.push("Lihat log master-bot.");
    return parts.join("\n\n");
  }
  const parts = [`Bot ${who} dihapus dari daftar bot.`];
  parts.push(
    res.archivedTo
      ? `Folder bot (workspace dan state) diarsipkan di:\n<code>${escapeHtml(res.archivedTo)}</code>\nToken tidak ikut diarsipkan. Arsip tidak pernah dihapus otomatis.`
      : `Folder bot memang sudah tidak ada di disk, jadi tidak ada yang diarsipkan.`,
  );
  const forced = stop.killed.filter((k) => !stop.pidsLeft.includes(k.pid));
  if (forced.length > 0) parts.push(`Server plugin yang tidak keluar sendiri dimatikan paksa: ${forced.map((k) => `pid ${k.pid} (${k.signal})`).join(", ")}.`);
  parts.push(`Token di @BotFather masih berlaku; cabut di sana kalau tidak dipakai lagi. Nama '${name}' bisa didaftarkan lagi dengan /register.`);
  return parts.join("\n\n");
}

/** Tidur yang selesai lebih awal kalau signal dibatalkan. */
const abortableSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });

const DELETE_FAILED =
  "Peringatan: pesan yang berisi token gagal dihapus dari chat. Hapus pesan itu sendiri.";

export function createMasterBot(opts: MasterBotOptions): Bot {
  const bot = new Bot(opts.token, { client: opts.client, botInfo: opts.botInfo });
  const locks = opts.locks ?? createBotLocks();
  const now = opts.now ?? Date.now;
  const confirmMs = opts.deleteConfirmMs ?? DELETE_CONFIRM_MS;

  /** Tempat membalas: pesan perintah, atau pesan bertombol yang ditekan. */
  type Chat = { reply: (text: string, other?: any) => Promise<unknown> };
  const wordsOf = (match: unknown) => (typeof match === "string" ? match : "").trim().split(/\s+/).filter(Boolean);
  /**
   * Pekerjaan tiap perintah yang butuh satu nama bot. Dipanggil dari perintah
   * yang diketik (`named`) dan dari tombol pemilih bot (picker.ts), jadi
   * hasilnya sama persis.
   */
  const actions = {} as Record<Exclude<PickCommand, "revoke">, (chat: Chat, name: string) => Promise<void>>;
  /**
   * Mendaftarkan perintah `/<command> <nama>`: tanpa argumen menampilkan
   * pemilih bot, argumen salah bentuk dijawab cara pakai, selain itu `run`.
   */
  const named = (command: Exclude<PickCommand, "revoke" | "logs">, usage: string, run: (chat: Chat, name: string) => Promise<void>) => {
    actions[command] = run;
    bot.command(command, async (ctx) => {
      const words = wordsOf(ctx.match);
      if (words.length === 0) {
        await picker.ask((t, o) => ctx.reply(t, o), command);
        return;
      }
      if (words.length !== 1 || !NAME_RULE.test(words[0]!)) {
        await ctx.reply(usage);
        return;
      }
      await run(ctx, words[0]!);
    });
  };

  // Penjaga akses: harus middleware pertama. Update yang bukan dari pemilik di
  // chat pribadi dibuang tanpa balasan, dan log tidak memuat isi pesan.
  bot.use(async (ctx, next) => {
    if (isOwnerUpdate(ctx.update, opts.ownerId)) {
      await next();
      return;
    }
    opts.log(`update diabaikan dari ${senderIdForLog(ctx.update)}`);
  });

  bot.command("help", (ctx) => ctx.reply(helpText()));
  // /start bukan perintah master-bot lagi (keputusan pemilik 2026-11-15, tiket
  // 261115202401). Telegram tetap mengirimnya saat tombol Start ditekan, jadi
  // ditelan di sini: tanpa balasan, tanpa perubahan apa pun.
  bot.command("start", () => {});

  // /list hanya membaca: registry, folder bots/, sesi tmux, dan bot.pid.
  bot.command("list", async (ctx) => {
    const probe = opts.probe ?? { tmux: realTmux, isAlive };
    const text = await listReport({ dataDir: opts.dataDir, ...probe, log: opts.log });
    await ctx.reply(text, { parse_mode: "HTML" });
  });

  // /logs hanya membaca layar (tanpa BotLocks): tidak bentrok dengan penyalaan.
  const showLogs = async (ctx: Chat, name: string, lines: number) => {
    const found = lookupName(name, "Tidak ada layar yang ditampilkan.");
    if ("reply" in found) {
      await ctx.reply(found.reply);
      return;
    }
    const probe = opts.probe ?? { tmux: realTmux, isAlive };
    const capture = opts.capture ?? realTmux.capture;
    const text = await logsReport(found.name, found.username, lines, {
      dataDir: opts.dataDir,
      tmux: { hasSession: (n) => probe.tmux.hasSession(n), capture },
      isAlive: probe.isAlive,
      masterToken: opts.token,
      log: opts.log,
    });
    await ctx.reply(text, { parse_mode: "HTML" });
  };
  actions.logs = (chat, name) => showLogs(chat, name, LOGS_DEFAULT_LINES);
  bot.command("logs", async (ctx) => {
    if (wordsOf(ctx.match).length === 0) {
      await picker.ask((t, o) => ctx.reply(t, o), "logs");
      return;
    }
    const args = parseLogsArgs(ctx.match);
    if (!args || !NAME_RULE.test(args.name)) {
      await ctx.reply(LOGS_USAGE);
      return;
    }
    await showLogs(ctx, args.name, args.lines);
  });

  // /quota hanya membaca registry.json dan status.json bot terdaftar (tanpa BotLocks).
  bot.command("quota", async (ctx) => {
    const text = quotaReport({ dataDir: opts.dataDir, log: opts.log, now: (opts.now ?? Date.now)() });
    await ctx.reply(text, { parse_mode: "HTML" });
  });

  /** Mengirim satu laporan ke pemilik, dengan kirim ulang saat Telegram terganggu. */
  const sendReport = async (what: string, name: string, text: string) => {
    const out = await sendWithRetry(
      (signal) => bot.api.sendMessage(opts.ownerId, text, { parse_mode: "HTML" }, signal),
      opts.signal,
      opts.reportRetry,
      ({ attempt, waitMs, reason }) =>
        opts.log(
          `laporan ${what} '${name}' gagal dikirim (percobaan ${attempt}): ${reason}; dicoba lagi dalam ${Math.round(waitMs / 1000)} detik`,
        ),
    );
    if (out.ok) {
      if (out.attempts > 1) opts.log(`laporan ${what} '${name}' terkirim pada percobaan ${out.attempts}`);
    } else {
      opts.log(`laporan ${what} '${name}' tidak terkirim: ${out.reason}`);
    }
  };

  /** Menulis status; false (dengan log) kalau gagal. */
  const recordStatus = async (name: string, status: BotStatus): Promise<boolean> => {
    try {
      const ok = await setBotStatus(opts.dataDir, name, status, opts.registryHooks);
      if (!ok) opts.log(`status '${name}' gagal dicatat: tidak ada di registry`);
      return ok;
    } catch (err) {
      opts.log(`status '${name}' gagal dicatat: ${describeError(err)}`);
      return false;
    }
  };

  /** Pekerjaan latar belakang; kunci bot dilepas setelah selesai. */
  const inBackground = (release: () => void, work: () => Promise<void>) => {
    const done = (async () => {
      try {
        await work();
      } finally {
        release();
      }
    })();
    opts.onLaunch?.(done);
  };

  // Penyalaan berjalan di latar belakang supaya master-bot tetap melayani
  // perintah lain selama menunggu (bisa sampai 90 detik).
  const launchAndReport = async (name: string, username: string, mode: ConversationMode | null) => {
    let res: LaunchResult;
    try {
      res = await opts.launch(name, mode ?? "new");
    } catch (err) {
      res = { kind: "failed", reason: "error di master-bot saat menyalakan", sessionAlive: false };
      opts.log(`penyalaan '${name}' error: ${describeError(err)}`);
    }
    let statusRecorded = true;
    if (res.kind !== "already-running") {
      statusRecorded = await recordStatus(name, res.kind === "active" ? "active" : "failed");
    }
    opts.log(
      `penyalaan '${name}': ${res.kind}` +
        (res.kind === "active" ? (res.conversation ? ` (${conversationNote(res.conversation)})` : "") : ` (${res.reason})`),
    );
    if (res.kind === "failed" && res.interrupted) {
      opts.log(
        `penyalaan '${name}' terputus: master-bot berhenti; status ${statusRecorded ? "ditulis 'failed'" : "gagal ditulis"}`,
      );
    }
    // Gangguan sementara (jaringan, 5xx, 429) dicoba ulang dengan jeda
    // bertambah; error lain dan berhentinya master-bot langsung dicatat.
    await sendReport("penyalaan", name, launchReport(name, username, res, statusRecorded, mode));
  };

  /** Bot terdaftar beserta username-nya, atau balasan penolakan. Nama sudah lolos NAME_RULE. */
  const lookupName = (name: string, nothing: string): { name: string; username: string } | { reply: string } => {
    let bots;
    try {
      bots = readRegistry(opts.dataDir).bots;
    } catch (err) {
      opts.log(`registry tidak bisa dibaca: ${describeError(err)}`);
      return { reply: `${err instanceof Error ? err.message : "registry.json tidak bisa dibaca"}. ${nothing}` };
    }
    if (!Object.hasOwn(bots, name)) return { reply: `Bot '${name}' tidak terdaftar. ${nothing}` };
    return { name, username: String(bots[name]!.username) };
  };

  const safeStop = async (name: string): Promise<StopResult> => {
    try {
      return await opts.stop(name);
    } catch (err) {
      opts.log(`/stop '${name}' error: ${describeError(err)}`);
      return { wasRunning: false, killed: [], sessionLeft: false, pidsLeft: [], error: "error di master-bot saat menghentikan" };
    }
  };

  // /keys (tiket 261115195101): tombol dari daftar tertutup ke sesi satu bot.
  // Kunci bot dipegang selama tombol dikirim, jadi tidak bentrok dengan
  // penyalaan (master-bot sendiri membaca layar dan menekan Enter saat itu),
  // /stop, /delete, atau /keys lain untuk bot yang sama.
  bot.command("keys", async (ctx) => {
    const args = parseKeysArgs(ctx.match);
    if (!args || !NAME_RULE.test(args.name)) {
      await ctx.reply(KEYS_USAGE);
      return;
    }
    const found = lookupName(args.name, "Tidak ada tombol yang dikirim.");
    if ("reply" in found) {
      await ctx.reply(found.reply);
      return;
    }
    const { name, username } = found;
    const release = locks.claim(name, "dikirimi tombol");
    if (!release) {
      await ctx.reply(busyText(name, locks.busyWith(name)!));
      return;
    }
    inBackground(release, async () => {
      const probe = opts.probe ?? { tmux: realTmux, isAlive };
      let text: string;
      try {
        text = await sendKeysAndReport(name, username, args.keys, {
          dataDir: opts.dataDir,
          tmux: { hasSession: (n) => probe.tmux.hasSession(n), capture: opts.capture ?? realTmux.capture },
          isAlive: probe.isAlive,
          masterToken: opts.token,
          log: opts.log,
          sendKey: opts.sendKey ?? realSendKey,
          sleep: abortableSleep,
          signal: opts.signal,
          ...opts.keysTiming,
        });
      } catch (err) {
        opts.log(`/keys '${name}' error: ${describeError(err)}`);
        text = `Perintah /keys untuk '${name}' gagal karena error di master-bot. Lihat layarnya dengan /logs ${name}.`;
      }
      await sendReport("tombol", name, text);
    });
  });

  named("stop", STOP_USAGE, async (ctx, asked) => {
    const found = lookupName(asked, "Tidak ada yang dihentikan.");
    if ("reply" in found) {
      await ctx.reply(found.reply);
      return;
    }
    const { name, username } = found;
    const release = locks.claim(name, "dihentikan");
    if (!release) {
      await ctx.reply(busyText(name, locks.busyWith(name)!));
      return;
    }
    try {
      await ctx.reply(`Menghentikan '${name}'...`);
    } finally {
      inBackground(release, async () => {
        // Niat pemilik dicatat lebih dulu (Q2): apa pun hasil pembersihannya,
        // bot ini tidak boleh dihidupkan otomatis.
        const statusRecorded = await recordStatus(name, "stopped");
        const res = await safeStop(name);
        opts.log(
          `/stop '${name}': ${isClean(res) ? "bersih" : "tidak bersih"}` +
            (res.pidsLeft.length > 0 ? `; pid tersisa ${res.pidsLeft.join(", ")}` : "") +
            (res.sessionLeft ? "; sesi tmux masih hidup" : ""),
        );
        await sendReport("penghentian", name, stopReport(name, username, res, statusRecorded));
      });
    }
  });

  /**
   * Henti lalu nyala untuk /restart ("continue") dan /new ("new", setelah
   * dikonfirmasi): kunci, balasan pertama, laporan, dan status yang sama.
   */
  const restartBot = async (reply: (text: string) => Promise<unknown>, name: string, username: string, mode: ConversationMode) => {
    const release = locks.claim(name, "dinyalakan ulang");
    if (!release) {
      await reply(busyText(name, locks.busyWith(name)!));
      return;
    }
    try {
      await reply(restartingText(name, mode));
    } finally {
      inBackground(release, async () => {
        const res = await safeStop(name);
        if (!isClean(res)) {
          opts.log(`/${mode === "new" ? "new" : "restart"} '${name}' batal: bot lama tidak bersih dimatikan`);
          await sendReport("penyalaan", name, restartBlockedReport(name, username, res));
          return;
        }
        await launchAndReport(name, username, mode);
      });
    }
  };

  // /restart selalu melanjutkan percakapan terakhir. Argumen kedua apa pun
  // (juga 'new', yang dulu berlaku) dijawab cara pakai; percakapan baru lewat
  // /new (keputusan pemilik 2026-11-15, tiket 261115202401).
  named("restart", RESTART_USAGE, async (ctx, asked) => {
    const found = lookupName(asked, "Tidak ada yang dinyalakan ulang.");
    if ("reply" in found) {
      await ctx.reply(found.reply);
      return;
    }
    await restartBot((t) => ctx.reply(t), found.name, found.username, "continue");
  });

  // /allow dan /revoke (tiket 261112225307): hanya allowFrom di access.json
  // bot yang disebut yang berubah. Master-bot tetap hanya melayani pemilik.
  const changeAndReply = async (ctx: Chat, op: "allow" | "revoke", asked: string, userId: string) => {
    const found = lookupName(asked, "Tidak ada yang diubah.");
    if ("reply" in found) {
      await ctx.reply(found.reply);
      return;
    }
    const { name, username } = found;
    const who = `@${username} ('${name}')`;
    const res = await changeAccess(opts.dataDir, name, userId, op, opts.ownerId, opts.accessHooks);
    let text: string;
    switch (res.kind) {
      case "owner":
        text = "Ditolak: itu ID pemilik. Pemilik tidak bisa mencabut aksesnya sendiri dari bot. Tidak ada yang diubah.";
        break;
      case "error":
        opts.log(`/${op} '${name}': ${res.reason}`);
        text = `${res.reason}. Tidak ada yang diubah.`;
        break;
      case "already":
        text = `${userId} sudah punya akses ke ${who}. Tidak ada yang diubah.`;
        break;
      case "absent":
        text = `${userId} memang tidak punya akses ke ${who}. Tidak ada yang diubah.`;
        break;
      case "added": {
        opts.log(`/allow '${name}': akses ditambahkan untuk ${userId}`);
        const parts = [
          `Akses diberikan: ${userId} sekarang bisa mengobrol dengan ${who}, berlaku langsung tanpa restart. ` +
            `Minta dia mengirim pesan lebih dulu ke @${username}. Bot lain dan master-bot tetap menolaknya.`,
          allowWarning(name, userId),
        ];
        const note = policyNote(res.access);
        if (note) parts.push(note);
        text = parts.join("\n\n");
        break;
      }
      case "removed":
        opts.log(`/revoke '${name}': akses dicabut dari ${userId}`);
        text = `Akses dicabut: pesan ${userId} ke ${who} mulai sekarang diabaikan.`;
        break;
    }
    await ctx.reply(text);
  };
  const accessCommand = (op: "allow" | "revoke") => async (ctx: { match: unknown; reply: (t: string, o?: any) => Promise<unknown> }) => {
    const words = wordsOf(ctx.match);
    // Hanya /revoke yang punya pemilih; /allow tetap diketik lengkap (keputusan pemilik).
    if (op === "revoke" && words.length === 0) {
      await picker.ask((t, o) => ctx.reply(t, o), "revoke");
      return;
    }
    if (words.length !== 2 || !NAME_RULE.test(words[0]!) || !isUserId(words[1]!)) {
      await ctx.reply(op === "allow" ? ALLOW_USAGE : REVOKE_USAGE);
      return;
    }
    await changeAndReply(ctx, op, words[0]!, words[1]!);
  };
  bot.command("allow", accessCommand("allow"));
  bot.command("revoke", accessCommand("revoke"));

  // /access hanya membaca access.json bot itu.
  named("access", ACCESS_USAGE, async (ctx, asked) => {
    const found = lookupName(asked, "");
    if ("reply" in found) {
      await ctx.reply(found.reply.trim());
      return;
    }
    const { name, username } = found;
    const read = readAccess(opts.dataDir, name);
    if (!read.ok) {
      opts.log(`/access '${name}': ${read.reason}`);
      await ctx.reply(`${read.reason}.`);
      return;
    }
    await ctx.reply(accessText(name, username, read.access, opts.ownerId));
  });

  // Konfirmasi dengan dua tombol, dipakai /delete (tiket 261112225306) dan /new
  // (tiket 261115202401): tidak ada yang berubah sebelum pemilik menekan tombol
  // lanjut. Setiap tombol sekali pakai dan berlaku terbatas.
  // Tombol terikat pada bot yang ditanyakan (telegramId + createdAt), bukan
  // hanya nama: nama bisa dihapus lalu didaftarkan ulang selama tombol berlaku.
  type ConfirmKind = "del" | "new";
  type Pending = { kind: ConfirmKind; name: string; telegramId: unknown; createdAt: unknown; expires: number };
  type Reply = (text: string) => Promise<unknown>;
  type Confirmation = {
    command: string;
    question: (name: string, username: string) => string;
    yesLabel: string;
    expired: string;
    cancelled: (name: string) => string;
    /** Akhiran balasan "tidak terdaftar". */
    nothing: string;
    /** Dijalankan setelah tombol lanjut lolos semua cek. */
    run: (reply: Reply, name: string, username: string, p: Pending) => Promise<void>;
  };
  const pending = new Map<string, Pending>();
  /** Identitas entri registry bot itu sekarang, atau null kalau tidak terbaca/tidak ada. */
  const identityOf = (name: string): { telegramId: unknown; createdAt: unknown } | null => {
    try {
      const bots = readRegistry(opts.dataDir).bots;
      if (!Object.hasOwn(bots, name)) return null;
      return { telegramId: bots[name]!.telegramId, createdAt: bots[name]!.createdAt };
    } catch {
      return null;
    }
  };

  const runDelete = async (reply: Reply, name: string, username: string, p: Pending) => {
    const release = locks.claim(name, "dihapus");
    if (!release) {
      await reply(busyText(name, locks.busyWith(name)!));
      return;
    }
    try {
      await reply(`Menghapus '${name}'...`);
    } finally {
      inBackground(release, async () => {
        const expectId = { telegramId: p.telegramId, createdAt: p.createdAt };
        // Niat menghapus dicatat lebih dulu (tiket 261113190701, Q1): kalau
        // master-bot mati di tengah, bot ini tidak dinyalakan otomatis lagi.
        // Gagal dicatat berarti batal sebelum apa pun disentuh.
        let marked;
        try {
          marked = await markStoppedForDelete(name, { dataDir: opts.dataDir, registryHooks: opts.registryHooks, expect: expectId });
        } catch (err) {
          opts.log(`/delete '${name}' error: ${describeError(err)}`);
          marked = { ok: false as const, reason: "error di master-bot saat mencatat status" };
        }
        if (!marked.ok) {
          opts.log(`/delete '${name}' batal: status 'stopped' gagal dicatat: ${marked.reason}`);
          await sendReport("penghapusan", name, deleteNotMarkedReport(name, username, marked.reason));
          return;
        }
        const stop = await safeStop(name);
        let res: ArchiveResult = { ok: false, reason: "dibatalkan: bot tidak bersih dimatikan", tokenRemoved: false, archivedTo: null };
        if (isClean(stop)) {
          try {
            res = await archiveBot(name, {
              dataDir: opts.dataDir,
              now: () => new Date(now()),
              registryHooks: opts.registryHooks,
              beforeMove: opts.beforeArchive,
              expect: expectId,
            });
          } catch (err) {
            res = { ok: false, reason: "error di master-bot saat mengarsipkan", tokenRemoved: false, archivedTo: null };
            opts.log(`/delete '${name}' error: ${describeError(err)}`);
          }
          // Tombol lain untuk bot yang sudah dihapus tidak boleh berlaku lagi.
          if (res.ok) for (const [k, q] of pending) if (q.name === name) pending.delete(k);
          opts.log(res.ok ? `/delete '${name}': dihapus, arsip ${res.archivedTo ?? "(tidak ada folder)"}` : `/delete '${name}' gagal: ${res.reason}`);
        } else {
          opts.log(`/delete '${name}' batal: bot tidak bersih dimatikan`);
        }
        await sendReport("penghapusan", name, deleteReport(name, username, stop, res));
      });
    }
  };

  const confirmations: Record<ConfirmKind, Confirmation> = {
    del: {
      command: "delete",
      question: deleteQuestion,
      yesLabel: "Hapus",
      expired: DELETE_EXPIRED,
      cancelled: (name) => `Penghapusan '${name}' dibatalkan. Tidak ada yang diubah.`,
      nothing: "Tidak ada yang dihapus.",
      run: runDelete,
    },
    new: {
      command: "new",
      question: newQuestion,
      yesLabel: "Mulai baru",
      expired: NEW_EXPIRED,
      cancelled: (name) => `Percakapan baru untuk '${name}' dibatalkan. Tidak ada yang diubah.`,
      nothing: "Tidak ada yang dinyalakan ulang.",
      run: (reply, name, username) => restartBot(reply, name, username, "new"),
    },
  };

  /**
   * Mengirim pertanyaan konfirmasi untuk bot terdaftar `name`. Tidak mengubah
   * apa pun; pekerjaannya baru jalan dari tombol lanjut. Bisa dipanggil dari
   * perintah yang diketik maupun dari tempat lain (mis. tombol pemilih bot).
   */
  const askConfirm = async (
    reply: (text: string, other?: { parse_mode: "HTML"; reply_markup: { inline_keyboard: { text: string; callback_data: string }[][] } }) => Promise<unknown>,
    kind: ConfirmKind,
    name: string,
    username: string,
  ) => {
    const c = confirmations[kind];
    const busy = locks.busyWith(name);
    if (busy) {
      await reply(busyText(name, busy));
      return;
    }
    for (const [id, p] of pending) if (p.expires <= now()) pending.delete(id);
    // Pemanggil sudah memastikan bot terdaftar. Kalau registry berubah di
    // antara keduanya, identitas kosong tidak pernah cocok saat tombol ditekan.
    const identity = identityOf(name) ?? { telegramId: null, createdAt: null };
    const id = randomBytes(8).toString("hex");
    pending.set(id, { kind, name, ...identity, expires: now() + confirmMs });
    await reply(c.question(name, username), {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: c.yesLabel, callback_data: `${kind}:yes:${id}` },
          { text: "Batal", callback_data: `${kind}:no:${id}` },
        ]],
      },
    });
  };

  named("delete", DELETE_USAGE, async (ctx, asked) => {
    const found = lookupName(asked, confirmations.del.nothing);
    if ("reply" in found) {
      await ctx.reply(found.reply);
      return;
    }
    await askConfirm((t, o) => ctx.reply(t, o), "del", found.name, found.username);
  });

  // /new (tiket 261115202401): percakapan kosong, dengan konfirmasi yang sama
  // seperti /delete; setelah dikonfirmasi langkahnya sama dengan /restart.
  named("new", NEW_USAGE, async (ctx, asked) => {
    const found = lookupName(asked, confirmations.new.nothing);
    if ("reply" in found) {
      await ctx.reply(found.reply);
      return;
    }
    await askConfirm((t, o) => ctx.reply(t, o), "new", found.name, found.username);
  });

  bot.callbackQuery(/^(del|new):(yes|no):([0-9a-f]{16})$/, async (ctx) => {
    const [, kind, answer, id] = ctx.match as RegExpMatchArray;
    const c = confirmations[kind as ConfirmKind];
    const found = pending.get(id!);
    // Tombol hanya berlaku untuk perintah yang menanyakannya.
    const p = found && found.kind === kind ? found : undefined;
    // Sekali pakai: diambil dari daftar apa pun jawabannya.
    if (p) pending.delete(id!);
    const clearButtons = async () => {
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
      } catch (err) {
        opts.log(`tombol /${c.command} gagal dihapus: ${describeError(err)}`);
      }
    };
    if (!p || p.expires <= now()) {
      await ctx.answerCallbackQuery({ text: "Kedaluwarsa" });
      await clearButtons();
      await ctx.reply(c.expired);
      return;
    }
    const { name } = p;
    await ctx.answerCallbackQuery();
    await clearButtons();
    if (answer !== "yes") {
      await ctx.reply(c.cancelled(name));
      return;
    }
    // Dicek ulang: bot bisa sudah dihapus lewat konfirmasi lain.
    const again = lookupName(name, c.nothing);
    if ("reply" in again) {
      await ctx.reply(again.reply);
      return;
    }
    const current = identityOf(name);
    if (!current || current.telegramId !== p.telegramId || current.createdAt !== p.createdAt) {
      // Bot yang ditanyakan sudah dihapus dan nama itu kini milik bot lain.
      opts.log(`/${c.command} '${name}' ditolak: tombol untuk bot lama, nama itu kini didaftarkan ulang`);
      await ctx.reply(c.expired);
      return;
    }
    await c.run((t) => ctx.reply(t), name, again.username, p);
  });

  // Pemilih bot (tiket 261115202403): tombol hanya memilih; pekerjaannya
  // fungsi yang sama dengan perintah yang diketik lengkap.
  const picker = createPicker({
    dataDir: opts.dataDir,
    ownerId: opts.ownerId,
    log: opts.log,
    now,
    ttlMs: confirmMs,
    actions,
    revoke: (chat, name, userId) => changeAndReply(chat, "revoke", name, userId),
  });
  bot.callbackQuery(PICK_DATA, (ctx) => picker.handle(ctx));

  // Tombol lain yang tidak dikenali (mis. dari versi lama): dijawab supaya
  // tidak berputar terus, tanpa mengubah apa pun.
  bot.on("callback_query:data", (ctx) => ctx.answerCallbackQuery({ text: "Kedaluwarsa" }));

  bot.command("register", async (ctx) => {
    const match = typeof ctx.match === "string" ? ctx.match : "";
    const hasArgs = match.trim() !== "";
    // Pesan yang memuat argumen apa pun bisa berisi token: hapus lebih dulu,
    // apa pun hasil registrasinya.
    let deleteFailed = false;
    if (hasArgs) {
      try {
        await ctx.deleteMessage();
      } catch (err) {
        deleteFailed = true;
        opts.log(`pesan /register gagal dihapus: ${describeError(err)}`);
      }
    }

    const args = parseRegisterArgs(match);
    let text: string;
    let toLaunch: { name: string; username: string } | undefined;
    if (!args.ok) {
      text = USAGE;
    } else {
      try {
        const res = await registerBot(args.name, args.token, {
          dataDir: opts.dataDir,
          ownerId: opts.ownerId,
          masterToken: opts.token,
          masterBotId: ctx.me.id,
          apiRoot: opts.client?.apiRoot,
          getMeTimeoutMs: opts.getMeTimeoutMs,
          registryHooks: opts.registryHooks,
        });
        if (res.ok) {
          text = `Bot @${res.username} terdaftar sebagai '${args.name}'. Menyalakan '${args.name}'...`;
          toLaunch = { name: args.name, username: res.username };
        } else {
          text = `Registrasi ditolak. ${res.reason}`;
        }
      } catch (err) {
        opts.log(`registrasi gagal: ${describeError(err)}`);
        text = "Registrasi gagal karena error di server master-bot. Tidak ada yang tercatat; lihat log master-bot.";
      }
    }
    // Balasan hanya dirangkai dari teks tetap, nama yang sudah lolos aturan,
    // dan username dari Telegram: token tidak pernah ikut.
    if (deleteFailed) text += `\n\n${DELETE_FAILED}`;
    // Bot dinyalakan setelah balasan "Menyalakan..." terkirim, supaya urutan
    // pesan di chat selalu: terdaftar/menyalakan, lalu aktif atau gagal.
    try {
      await ctx.reply(text);
    } finally {
      if (toLaunch) {
        const { name, username } = toLaunch;
        const release = locks.claim(name, "dinyalakan");
        if (release) inBackground(release, () => launchAndReport(name, username, null));
        else opts.log(`penyalaan '${name}' dilewati: ${busyText(name, locks.busyWith(name) ?? "dinyalakan")}`);
      }
    }
  });

  bot.catch((err) => {
    opts.log(`error saat menangani update ${err.ctx.update.update_id}: ${describeError(err.error)}`);
  });

  return bot;
}
