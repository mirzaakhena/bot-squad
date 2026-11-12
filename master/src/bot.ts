import { Bot, type ApiClientOptions } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { isOwnerUpdate, senderIdForLog } from "./access.ts";
import { describeError, redact, type Logger } from "./log.ts";
import { parseRegisterArgs, registerBot, USAGE } from "./register.ts";
import type { WriteHooks } from "./registry.ts";

/** Perintah yang sudah berfungsi. Daftar ini juga dikirim lewat setMyCommands. */
export const COMMANDS = [
  { command: "start", description: "Tampilkan daftar perintah" },
  { command: "help", description: "Tampilkan daftar perintah" },
  { command: "register", description: "Daftarkan bot baru: /register <nama> <token>" },
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
};

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
        text = res.ok
          ? `Bot @${res.username} terdaftar sebagai '${args.name}'. Folder state dan workspace sudah dibuat; bot belum dinyalakan.`
          : `Registrasi ditolak. ${res.reason}`;
      } catch (err) {
        opts.log(`registrasi gagal: ${describeError(err)}`);
        text = "Registrasi gagal karena error di server master-bot. Tidak ada yang tercatat; lihat log master-bot.";
      }
      if (deleteFailed) text += `\n\n${DELETE_FAILED}`;
      // Lapisan terakhir: balasan tidak pernah memuat token.
      text = redact(text, [args.token, opts.token]);
    }
    if (!args.ok && deleteFailed) text += `\n\n${DELETE_FAILED}`;
    await ctx.reply(text);
  });

  bot.catch((err) => {
    opts.log(`error saat menangani update ${err.ctx.update.update_id}: ${describeError(err.error)}`);
  });

  return bot;
}
