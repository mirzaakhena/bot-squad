import { Bot, type ApiClientOptions } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { isOwnerUpdate, senderIdForLog } from "./access.ts";
import { describeError, type Logger } from "./log.ts";
import { NAME_RULE, parseRegisterArgs, registerBot, USAGE } from "./register.ts";
import { readRegistry, setBotStatus, type BotStatus, type WriteHooks } from "./registry.ts";
import { isAlive, realTmux, type LaunchResult } from "./launch.ts";
import { listReport, type ProbeDeps } from "./list.ts";
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

/** Perintah yang sudah berfungsi. Daftar ini juga menjadi menu perintah (lihat menu.ts). */
export const COMMANDS = [
  { command: "start", description: "Tampilkan daftar perintah" },
  { command: "help", description: "Tampilkan daftar perintah" },
  { command: "register", description: "Daftarkan bot baru: /register <nama> <token>" },
  { command: "list", description: "Daftar bot beserta keadaan nyatanya" },
  { command: "stop", description: "Hentikan satu bot: /stop <nama>" },
  { command: "restart", description: "Nyalakan ulang satu bot: /restart <nama>" },
  { command: "allow", description: "Izinkan orang lain memakai satu bot: /allow <nama> <user_id>" },
  { command: "revoke", description: "Cabut akses orang lain ke satu bot: /revoke <nama> <user_id>" },
  { command: "access", description: "Siapa saja yang punya akses ke satu bot: /access <nama>" },
] as const;

export function helpText(): string {
  return [
    "master-bot: panel kontrol bot-squad.",
    "",
    "Perintah yang tersedia:",
    ...COMMANDS.map((c) => `/${c.command} - ${c.description}`),
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
  /** Menyalakan bot yang baru terdaftar (asli: launchBot dengan realLaunchDeps). */
  launch: (name: string) => Promise<LaunchResult>;
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
  /** Jeda kirim ulang laporan penyalaan; diganti di tes. */
  reportRetry?: RetryPolicy;
  /** Kait untuk tes penulisan access.json (/allow, /revoke). */
  accessHooks?: AccessWriteHooks;
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const STATUS_NOT_RECORDED = "Status di registry gagal dicatat; lihat log master-bot.";

/**
 * Pesan hasil penyalaan bot untuk pemilik (HTML). statusRecorded false berarti
 * status active/failed gagal ditulis ke registry.
 */
export function launchReport(name: string, username: string, res: LaunchResult, statusRecorded = true): string {
  const who = `@${escapeHtml(username)} ('${name}')`;
  if (res.kind === "active") {
    const text = `Bot ${who} aktif. Silakan ajak bicara.`;
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
export const RESTART_USAGE = "Cara pakai: /restart <nama>\nNama hanya huruf kecil, angka, dan '-'.";

const DELETE_FAILED =
  "Peringatan: pesan yang berisi token gagal dihapus dari chat. Hapus pesan itu sendiri.";

export function createMasterBot(opts: MasterBotOptions): Bot {
  const bot = new Bot(opts.token, { client: opts.client, botInfo: opts.botInfo });
  const locks = opts.locks ?? createBotLocks();

  // Penjaga akses: harus middleware pertama. Update yang bukan dari pemilik di
  // chat pribadi dibuang tanpa balasan, dan log tidak memuat isi pesan.
  bot.use(async (ctx, next) => {
    if (isOwnerUpdate(ctx.update, opts.ownerId)) {
      await next();
      return;
    }
    opts.log(`update diabaikan dari ${senderIdForLog(ctx.update)}`);
  });

  bot.command(["start", "help"], (ctx) => ctx.reply(helpText()));

  // /list hanya membaca: registry, folder bots/, sesi tmux, dan bot.pid.
  bot.command("list", async (ctx) => {
    const probe = opts.probe ?? { tmux: realTmux, isAlive };
    const text = await listReport({ dataDir: opts.dataDir, ...probe, log: opts.log });
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
  const launchAndReport = async (name: string, username: string) => {
    let res: LaunchResult;
    try {
      res = await opts.launch(name);
    } catch (err) {
      res = { kind: "failed", reason: "error di master-bot saat menyalakan", sessionAlive: false };
      opts.log(`penyalaan '${name}' error: ${describeError(err)}`);
    }
    let statusRecorded = true;
    if (res.kind !== "already-running") {
      statusRecorded = await recordStatus(name, res.kind === "active" ? "active" : "failed");
    }
    opts.log(`penyalaan '${name}': ${res.kind}${res.kind === "active" ? "" : ` (${res.reason})`}`);
    if (res.kind === "failed" && res.interrupted) {
      opts.log(
        `penyalaan '${name}' terputus: master-bot berhenti; status ${statusRecorded ? "ditulis 'failed'" : "gagal ditulis"}`,
      );
    }
    // Gangguan sementara (jaringan, 5xx, 429) dicoba ulang dengan jeda
    // bertambah; error lain dan berhentinya master-bot langsung dicatat.
    await sendReport("penyalaan", name, launchReport(name, username, res, statusRecorded));
  };

  /** Hasil cek nama untuk /stop dan /restart: bot terdaftar beserta username-nya, atau balasan penolakan. */
  const lookup = (match: unknown, usage: string, nothing: string): { name: string; username: string } | { reply: string } => {
    const words = (typeof match === "string" ? match : "").trim().split(/\s+/).filter(Boolean);
    if (words.length !== 1 || !NAME_RULE.test(words[0]!)) return { reply: usage };
    return lookupName(words[0]!, nothing);
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

  bot.command("stop", async (ctx) => {
    const found = lookup(ctx.match, STOP_USAGE, "Tidak ada yang dihentikan.");
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

  bot.command("restart", async (ctx) => {
    const found = lookup(ctx.match, RESTART_USAGE, "Tidak ada yang dinyalakan ulang.");
    if ("reply" in found) {
      await ctx.reply(found.reply);
      return;
    }
    const { name, username } = found;
    const release = locks.claim(name, "dinyalakan ulang");
    if (!release) {
      await ctx.reply(busyText(name, locks.busyWith(name)!));
      return;
    }
    try {
      await ctx.reply(`Menyalakan ulang '${name}'...`);
    } finally {
      inBackground(release, async () => {
        const res = await safeStop(name);
        if (!isClean(res)) {
          opts.log(`/restart '${name}' batal: bot lama tidak bersih dimatikan`);
          await sendReport("penyalaan", name, restartBlockedReport(name, username, res));
          return;
        }
        await launchAndReport(name, username);
      });
    }
  });

  // /allow dan /revoke (tiket 261112225307): hanya allowFrom di access.json
  // bot yang disebut yang berubah. Master-bot tetap hanya melayani pemilik.
  const accessCommand = (op: "allow" | "revoke") => async (ctx: { match: unknown; reply: (t: string) => Promise<unknown> }) => {
    const usage = op === "allow" ? ALLOW_USAGE : REVOKE_USAGE;
    const words = (typeof ctx.match === "string" ? ctx.match : "").trim().split(/\s+/).filter(Boolean);
    if (words.length !== 2 || !NAME_RULE.test(words[0]!) || !isUserId(words[1]!)) {
      await ctx.reply(usage);
      return;
    }
    const userId = words[1]!;
    const found = lookupName(words[0]!, "Tidak ada yang diubah.");
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
  bot.command("allow", accessCommand("allow"));
  bot.command("revoke", accessCommand("revoke"));

  // /access hanya membaca access.json bot itu.
  bot.command("access", async (ctx) => {
    const found = lookup(ctx.match, ACCESS_USAGE, "");
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
        if (release) inBackground(release, () => launchAndReport(name, username));
        else opts.log(`penyalaan '${name}' dilewati: ${busyText(name, locks.busyWith(name) ?? "dinyalakan")}`);
      }
    }
  });

  bot.catch((err) => {
    opts.log(`error saat menangani update ${err.ctx.update.update_id}: ${describeError(err.error)}`);
  });

  return bot;
}
