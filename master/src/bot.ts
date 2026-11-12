import { Bot, type ApiClientOptions } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { isOwnerUpdate, senderIdForLog } from "./access.ts";
import { describeError, type Logger } from "./log.ts";

/** Perintah yang sudah berfungsi. Daftar ini juga dikirim lewat setMyCommands. */
export const COMMANDS = [
  { command: "start", description: "Tampilkan daftar perintah" },
  { command: "help", description: "Tampilkan daftar perintah" },
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
  /** Diisi di tes supaya tidak perlu getMe. */
  botInfo?: UserFromGetMe;
};

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

  bot.catch((err) => {
    opts.log(`error saat menangani update ${err.ctx.update.update_id}: ${describeError(err.error)}`);
  });

  return bot;
}
