import { randomBytes } from "node:crypto";
import { readAccess } from "./allow.ts";
import { describeError, type Logger } from "./log.ts";
import { readRegistry } from "./registry.ts";

/**
 * Pemilih bot lewat tombol (tiket 261115202403, keputusan pemilik 2026-11-15):
 * perintah yang butuh nama bot, dikirim tanpa argumen, menampilkan bot
 * terdaftar sebagai tombol. /revoke bertanya dua kali: bot, lalu user_id.
 *
 * Berkas ini hanya mengurus pertanyaan dan tombolnya. Pekerjaan perintahnya
 * tetap fungsi yang sama dengan perintah yang diketik lengkap (`actions`),
 * jadi hasilnya tidak bisa berbeda.
 *
 * Data tombol hanya `pick:<id>:<nomor>` (atau `x` untuk cancel): nama bot dan
 * user_id tidak pernah ada di data tombol. Nomor merujuk daftar yang dicatat
 * di sini saat pertanyaan dikirim, dan pilihan dicek ulang terhadap registry
 * saat ditekan.
 */

export const PICK_COMMANDS = ["stop", "restart", "new", "logs", "access", "delete", "revoke"] as const;
export type PickCommand = (typeof PICK_COMMANDS)[number];

export const PICK_PER_ROW = 3;
/** Batas Telegram 100 tombol per pesan; satu disisakan untuk cancel. */
export const PICK_MAX = 99;
export const PICK_CANCEL_LABEL = "cancel";
export const PICK_DATA = /^pick:([0-9a-f]{16}):(x|[0-9]{1,2})$/;

export const PICK_EXPIRED = "Pilihan ini sudah kedaluwarsa atau sudah dipakai. Tidak ada yang diubah. Kirim perintahnya lagi kalau masih perlu.";
export const PICK_NO_BOTS =
  "Belum ada bot terdaftar.\n\nDaftarkan bot baru dengan /register <nama> <token>. " +
  "Buat bot-nya dulu di @BotFather untuk mendapatkan token.";

export const pickBotQuestion = (command: PickCommand, shown: number, total: number) =>
  `Pilih bot untuk /${command}:` +
  (shown < total ? `\n\nHanya ${shown} dari ${total} bot yang ditampilkan; untuk bot lain ketik /${command} <nama>.` : "") +
  `\n\nTombol berlaku 5 menit.`;
export const pickUserQuestion = (name: string, username: string, shown: number, total: number) =>
  `Pilih user_id yang aksesnya dicabut dari @${username} ('${name}'):` +
  (shown < total ? `\n\nHanya ${shown} dari ${total} user_id yang ditampilkan; untuk yang lain ketik /revoke ${name} <user_id>.` : "") +
  `\n\nTombol berlaku 5 menit.`;
export const pickedBotText = (command: PickCommand, name: string) => `/${command}: dipilih '${name}'.`;
export const pickedUserText = (name: string, userId: string) => `/revoke: dipilih ${userId} di '${name}'.`;
export const pickCancelledText = (command: PickCommand) => `/${command} dibatalkan. Tidak ada yang diubah.`;
export const nothingToRevokeText = (name: string, username: string) =>
  `Tidak ada yang bisa dicabut dari @${username} ('${name}'): tidak ada user_id selain pemilik yang punya akses.`;

type Button = { text: string; callback_data: string };
export type PickReply = (text: string, other?: { reply_markup: { inline_keyboard: Button[][] } }) => Promise<unknown>;

/** Yang dipakai dari context grammY saat tombol ditekan. */
export type PickContext = {
  match: unknown;
  answerCallbackQuery: (other?: { text: string }) => Promise<unknown>;
  editMessageText: (text: string) => Promise<unknown>;
  editMessageReplyMarkup: (other: { reply_markup: { inline_keyboard: Button[][] } }) => Promise<unknown>;
  reply: (text: string, other?: any) => Promise<unknown>;
};

export type PickerDeps = {
  dataDir: string;
  ownerId: number;
  log: Logger;
  now: () => number;
  /** Masa berlaku tombol (sama dengan tombol konfirmasi /delete). */
  ttlMs: number;
  /** Pekerjaan perintah untuk satu nama bot: fungsi yang sama dengan perintah yang diketik. */
  actions: Record<Exclude<PickCommand, "revoke">, (ctx: PickContext, name: string) => Promise<void>>;
  /** Pekerjaan /revoke <nama> <user_id>. */
  revoke: (ctx: PickContext, name: string, userId: string) => Promise<void>;
};

/** Bot yang ditampilkan: nama dan identitas entri registry saat itu. */
type Shown = { name: string; telegramId: unknown; createdAt: unknown };
type Entry =
  | { step: "bot"; command: PickCommand; bots: Shown[]; expires: number }
  | { step: "user"; command: "revoke"; bot: Shown; users: string[]; expires: number };

/** Tombol pilihan, tiga per baris, lalu satu baris cancel. */
export function pickKeyboard(id: string, labels: string[]): Button[][] {
  const rows: Button[][] = [];
  labels.forEach((text, i) => {
    if (i % PICK_PER_ROW === 0) rows.push([]);
    rows[rows.length - 1]!.push({ text, callback_data: `pick:${id}:${i}` });
  });
  rows.push([{ text: PICK_CANCEL_LABEL, callback_data: `pick:${id}:x` }]);
  return rows;
}

export function createPicker(d: PickerDeps) {
  const pending = new Map<string, Entry>();

  const remember = (entry: Entry): string => {
    for (const [id, e] of pending) if (e.expires <= d.now()) pending.delete(id);
    const id = randomBytes(8).toString("hex");
    pending.set(id, entry);
    return id;
  };

  /** Bot itu di registry sekarang, hanya kalau masih entri yang sama dengan yang ditampilkan. */
  const stillThere = (bot: Shown): { username: string } | null => {
    try {
      const bots = readRegistry(d.dataDir).bots;
      if (!Object.hasOwn(bots, bot.name)) return null;
      const now = bots[bot.name]!;
      if (now.telegramId !== bot.telegramId || now.createdAt !== bot.createdAt) return null;
      return { username: String(now.username) };
    } catch (err) {
      d.log(`registry tidak bisa dibaca: ${describeError(err)}`);
      return null;
    }
  };

  /** Perintah tanpa argumen: tampilkan bot terdaftar sebagai tombol. Tidak mengubah apa pun. */
  const ask = async (reply: PickReply, command: PickCommand): Promise<void> => {
    let bots;
    try {
      bots = readRegistry(d.dataDir).bots;
    } catch (err) {
      d.log(`registry tidak bisa dibaca: ${describeError(err)}`);
      await reply(`${err instanceof Error ? err.message : "registry.json tidak bisa dibaca"}. Tidak ada yang diubah.`);
      return;
    }
    const names = Object.keys(bots).sort();
    if (names.length === 0) {
      await reply(PICK_NO_BOTS);
      return;
    }
    const shown: Shown[] = names
      .slice(0, PICK_MAX)
      .map((name) => ({ name, telegramId: bots[name]!.telegramId, createdAt: bots[name]!.createdAt }));
    const id = remember({ step: "bot", command, bots: shown, expires: d.now() + d.ttlMs });
    await reply(pickBotQuestion(command, shown.length, names.length), {
      reply_markup: { inline_keyboard: pickKeyboard(id, shown.map((b) => b.name)) },
    });
  };

  /** Langkah kedua /revoke: user_id yang punya akses ke bot itu, tanpa pemilik. */
  const askUser = async (ctx: PickContext, bot: Shown, username: string): Promise<void> => {
    const read = readAccess(d.dataDir, bot.name);
    if (!read.ok) {
      d.log(`/revoke '${bot.name}': ${read.reason}`);
      await ctx.reply(`${read.reason}. Tidak ada yang diubah.`);
      return;
    }
    const all = [...new Set(read.access.allowFrom)].filter((u) => u !== String(d.ownerId));
    if (all.length === 0) {
      await ctx.reply(nothingToRevokeText(bot.name, username));
      return;
    }
    const users = all.slice(0, PICK_MAX);
    const id = remember({ step: "user", command: "revoke", bot, users, expires: d.now() + d.ttlMs });
    await ctx.reply(pickUserQuestion(bot.name, username, users.length, all.length), {
      reply_markup: { inline_keyboard: pickKeyboard(id, users) },
    });
  };

  /** Penangan tombol `pick:<id>:<nomor|x>`. */
  const handle = async (ctx: PickContext): Promise<void> => {
    const [, id, choice] = ctx.match as RegExpMatchArray;
    const entry = pending.get(id!);
    // Sekali pakai: diambil dari daftar apa pun yang ditekan.
    if (entry) pending.delete(id!);

    const clearButtons = async () => {
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
      } catch (err) {
        d.log(`tombol pemilih gagal dihapus: ${describeError(err)}`);
      }
    };
    const expired = async () => {
      await ctx.answerCallbackQuery({ text: "Kedaluwarsa" });
      await clearButtons();
      await ctx.reply(PICK_EXPIRED);
    };
    /** Pesan pertanyaan diganti dengan apa yang dipilih; tombolnya ikut hilang. */
    const settle = async (text: string) => {
      try {
        await ctx.editMessageText(text);
      } catch (err) {
        d.log(`pesan pemilih gagal diubah: ${describeError(err)}`);
        await clearButtons();
        await ctx.reply(text);
      }
    };

    if (!entry || entry.expires <= d.now()) return expired();
    if (choice === "x") {
      await ctx.answerCallbackQuery();
      await settle(pickCancelledText(entry.command));
      return;
    }
    const n = Number(choice);
    const bot = entry.step === "bot" ? entry.bots[n] : entry.bot;
    const userId = entry.step === "user" ? entry.users[n] : undefined;
    if (!bot || (entry.step === "user" && userId === undefined)) return expired();
    // Dicek ulang: bot yang ditampilkan bisa sudah dihapus, atau namanya kini milik bot lain.
    const current = stillThere(bot);
    if (!current) {
      d.log(`/${entry.command} '${bot.name}' ditolak: tombol pemilih untuk bot yang sudah tidak terdaftar atau sudah didaftarkan ulang`);
      return expired();
    }
    await ctx.answerCallbackQuery();
    if (entry.step === "user") {
      await settle(pickedUserText(bot.name, userId!));
      await d.revoke(ctx, bot.name, userId!);
      return;
    }
    await settle(pickedBotText(entry.command, bot.name));
    if (entry.command === "revoke") await askUser(ctx, bot, current.username);
    else await d.actions[entry.command](ctx, bot.name);
  };

  return { ask, handle };
}
