import type { Update } from "grammy/types";

/** Pengirim dan jenis chat sebuah update, kalau ada. */
function senderAndChat(update: Update): { fromId?: number; chatId?: number; chatType?: string } {
  const msg =
    update.message ??
    update.edited_message ??
    update.callback_query?.message ??
    update.my_chat_member ??
    update.chat_member ??
    update.chat_join_request ??
    update.message_reaction;
  const from =
    update.message?.from ??
    update.edited_message?.from ??
    update.callback_query?.from ??
    update.my_chat_member?.from ??
    update.chat_member?.from ??
    update.chat_join_request?.from ??
    update.message_reaction?.user;
  return { fromId: from?.id, chatId: msg?.chat.id, chatType: msg?.chat.type };
}

/**
 * Hanya update dari pemilik di chat pribadinya dengan master-bot yang dilayani:
 * pengirim = pemilik, jenis chat = private, dan ID chat = ID pemilik.
 * Grup (termasuk pesan pemilik di grup), channel, inline query, dan semua
 * update dari akun lain ditolak.
 */
export function isOwnerUpdate(update: Update, ownerId: number): boolean {
  const { fromId, chatId, chatType } = senderAndChat(update);
  return fromId === ownerId && chatType === "private" && chatId === ownerId;
}

/** ID pengirim untuk log, tanpa isi pesan apa pun. */
export function senderIdForLog(update: Update): string {
  const { fromId } = senderAndChat(update);
  if (fromId !== undefined) return String(fromId);
  const other =
    update.inline_query?.from ??
    update.chosen_inline_result?.from ??
    update.shipping_query?.from ??
    update.pre_checkout_query?.from ??
    update.poll_answer?.user;
  if (other) return String(other.id);
  const chat = update.channel_post?.chat ?? update.edited_channel_post?.chat;
  if (chat) return `channel ${chat.id}`;
  return "pengirim tidak dikenal";
}
