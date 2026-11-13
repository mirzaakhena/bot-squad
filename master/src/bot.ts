import { Bot, type ApiClientOptions } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { isOwnerUpdate, senderIdForLog } from "./access.ts";
import { describeError, type Logger } from "./log.ts";
import { parseRegisterArgs, registerBot, USAGE } from "./register.ts";
import { setBotStatus, type WriteHooks } from "./registry.ts";
import { isAlive, realTmux, type LaunchResult } from "./launch.ts";
import { listReport, type ProbeDeps } from "./list.ts";
import { sendWithRetry, type RetryPolicy } from "./retry.ts";

/** Perintah yang sudah berfungsi. Daftar ini juga menjadi menu perintah (lihat menu.ts). */
export const COMMANDS = [
  { command: "start", description: "Tampilkan daftar perintah" },
  { command: "help", description: "Tampilkan daftar perintah" },
  { command: "register", description: "Daftarkan bot baru: /register <nama> <token>" },
  { command: "list", description: "Daftar bot beserta keadaan nyatanya" },
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
  /** Dipanggil dengan proses penyalaan di latar belakang; dipakai tes untuk menunggunya. */
  onLaunch?: (done: Promise<void>) => void;
  /** Dibatalkan saat master-bot berhenti: percobaan kirim ulang laporan dihentikan. */
  signal?: AbortSignal;
  /** Cek keadaan nyata untuk /list; default tmux dan cek pid asli. Diganti di tes. */
  probe?: Omit<ProbeDeps, "dataDir">;
  /** Jeda kirim ulang laporan penyalaan; diganti di tes. */
  reportRetry?: RetryPolicy;
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
  parts.push(
    statusRecorded
      ? "Status tercatat 'failed'. Percobaan ulang menunggu perintah berikutnya (belum tersedia)."
      : `${STATUS_NOT_RECORDED} Percobaan ulang menunggu perintah berikutnya (belum tersedia).`,
  );
  return parts.join("\n\n");
}

const DELETE_FAILED =
  "Peringatan: pesan yang berisi token gagal dihapus dari chat. Hapus pesan itu sendiri.";

export function createMasterBot(opts: MasterBotOptions): Bot {
  const bot = new Bot(opts.token, { client: opts.client, botInfo: opts.botInfo });

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

  // Penyalaan berjalan di latar belakang supaya master-bot tetap melayani
  // perintah lain selama menunggu (bisa sampai 90 detik).
  const launchInBackground = (name: string, username: string) => {
    const done = (async () => {
      let res: LaunchResult;
      try {
        res = await opts.launch(name);
      } catch (err) {
        res = { kind: "failed", reason: "error di master-bot saat menyalakan", sessionAlive: false };
        opts.log(`penyalaan '${name}' error: ${describeError(err)}`);
      }
      let statusRecorded = true;
      if (res.kind !== "already-running") {
        try {
          statusRecorded = await setBotStatus(opts.dataDir, name, res.kind === "active" ? "active" : "failed", opts.registryHooks);
          if (!statusRecorded) opts.log(`status '${name}' gagal dicatat: tidak ada di registry`);
        } catch (err) {
          statusRecorded = false;
          opts.log(`status '${name}' gagal dicatat: ${describeError(err)}`);
        }
      }
      opts.log(`penyalaan '${name}': ${res.kind}${res.kind === "active" ? "" : ` (${res.reason})`}`);
      if (res.kind === "failed" && res.interrupted) {
        opts.log(
          `penyalaan '${name}' terputus: master-bot berhenti; status ${statusRecorded ? "ditulis 'failed'" : "gagal ditulis"}`,
        );
      }
      // Gangguan sementara (jaringan, 5xx, 429) dicoba ulang dengan jeda
      // bertambah; error lain dan berhentinya master-bot langsung dicatat.
      const text = launchReport(name, username, res, statusRecorded);
      const out = await sendWithRetry(
        (signal) => bot.api.sendMessage(opts.ownerId, text, { parse_mode: "HTML" }, signal),
        opts.signal,
        opts.reportRetry,
        ({ attempt, waitMs, reason }) =>
          opts.log(
            `laporan penyalaan '${name}' gagal dikirim (percobaan ${attempt}): ${reason}; dicoba lagi dalam ${Math.round(waitMs / 1000)} detik`,
          ),
      );
      if (out.ok) {
        if (out.attempts > 1) opts.log(`laporan penyalaan '${name}' terkirim pada percobaan ${out.attempts}`);
      } else {
        opts.log(`laporan penyalaan '${name}' tidak terkirim: ${out.reason}`);
      }
    })();
    opts.onLaunch?.(done);
  };

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
      if (toLaunch) launchInBackground(toLaunch.name, toLaunch.username);
    }
  });

  bot.catch((err) => {
    opts.log(`error saat menangani update ${err.ctx.update.update_id}: ${describeError(err.error)}`);
  });

  return bot;
}
