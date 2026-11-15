import type { Update } from "grammy/types";

export const OWNER = 111222333;
export const STRANGER = 444555666;

let nextId = 1;
const user = (id: number) => ({ id, is_bot: false, first_name: `u${id}` });
const dm = (id: number) => ({ id, type: "private" as const, first_name: `u${id}` });
const group = { id: -100123, type: "supergroup" as const, title: "grup" };

function textMessage(text: string, from: number, chat: any) {
  const entities = text.startsWith("/")
    ? [{ type: "bot_command" as const, offset: 0, length: text.split(" ")[0]!.length }]
    : undefined;
  return { message_id: nextId, date: 0, chat, from: user(from), text, entities };
}

export const ownerDm = (text: string): Update => ({
  update_id: nextId++,
  message: textMessage(text, OWNER, dm(OWNER)),
});

/** Semua update yang tidak boleh dibalas, masing-masing dengan nama kasusnya. */
export function ignoredUpdates(): Array<[string, Update]> {
  return [
    ["/start dari akun lain di DM", { update_id: nextId++, message: textMessage("/start", STRANGER, dm(STRANGER)) }],
    ["/help dari akun lain di DM", { update_id: nextId++, message: textMessage("/help", STRANGER, dm(STRANGER)) }],
    ["/register dari akun lain di DM", { update_id: nextId++, message: textMessage("/register uji-x 123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAA", STRANGER, dm(STRANGER)) }],
    ["/stop dari akun lain di DM", { update_id: nextId++, message: textMessage("/stop uji-x", STRANGER, dm(STRANGER)) }],
    ["/restart dari akun lain di DM", { update_id: nextId++, message: textMessage("/restart uji-x", STRANGER, dm(STRANGER)) }],
    ["/logs dari akun lain di DM", { update_id: nextId++, message: textMessage("/logs uji-x", STRANGER, dm(STRANGER)) }],
    ["/logs dari pemilik di grup", { update_id: nextId++, message: textMessage("/logs uji-x 50", OWNER, group) }],
    ["/keys dari akun lain di DM", { update_id: nextId++, message: textMessage("/keys uji-x enter", STRANGER, dm(STRANGER)) }],
    ["/keys dari pemilik di grup", { update_id: nextId++, message: textMessage("/keys uji-x enter", OWNER, group) }],
    ["/quota dari akun lain di DM", { update_id: nextId++, message: textMessage("/quota", STRANGER, dm(STRANGER)) }],
    ["/quota dari pemilik di grup", { update_id: nextId++, message: textMessage("/quota", OWNER, group) }],
    ["/delete dari akun lain di DM", { update_id: nextId++, message: textMessage("/delete uji-x", STRANGER, dm(STRANGER)) }],
    ["/delete dari pemilik di grup", { update_id: nextId++, message: textMessage("/delete uji-x", OWNER, group) }],
    ["/stop dari pemilik di grup", { update_id: nextId++, message: textMessage("/stop uji-x", OWNER, group) }],
    ["/register dari pemilik di grup", { update_id: nextId++, message: textMessage("/register uji-x 123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAA", OWNER, group) }],
    ["teks biasa dari akun lain", { update_id: nextId++, message: textMessage("halo", STRANGER, dm(STRANGER)) }],
    ["/start dari akun lain di grup", { update_id: nextId++, message: textMessage("/start", STRANGER, group) }],
    ["/start dari pemilik di grup", { update_id: nextId++, message: textMessage("/start", OWNER, group) }],
    ["/help@bot dari pemilik di grup", { update_id: nextId++, message: textMessage("/help@uji_master_bot", OWNER, group) }],
    ["pesan diedit dari akun lain", { update_id: nextId++, edited_message: { ...textMessage("/start", STRANGER, dm(STRANGER)), edit_date: 1 } }],
    ["pesan channel", { update_id: nextId++, channel_post: { message_id: 1, date: 0, chat: { id: -100999, type: "channel", title: "c" }, text: "/start" } as any }],
    ["inline query dari pemilik", { update_id: nextId++, inline_query: { id: "iq", from: user(OWNER), query: "/start", offset: "" } }],
    ["inline query dari akun lain", { update_id: nextId++, inline_query: { id: "iq2", from: user(STRANGER), query: "x", offset: "" } }],
    ["callback dari akun lain", { update_id: nextId++, callback_query: { id: "cb", from: user(STRANGER), chat_instance: "ci", data: "x", message: textMessage("x", ME_ID, dm(STRANGER)) as any } }],
    ["callback dari pemilik di grup", { update_id: nextId++, callback_query: { id: "cb2", from: user(OWNER), chat_instance: "ci", data: "x", message: textMessage("x", ME_ID, group) as any } }],
    // Dua kasus berikut tidak terjadi di Telegram asli, tetapi menjaga agar
    // setiap syarat penjaga akses tetap berlaku sendiri-sendiri.
    ["pengirim lain di chat ber-ID pemilik", { update_id: nextId++, message: textMessage("/start", STRANGER, dm(OWNER)) }],
    ["chat non-private ber-ID pemilik", { update_id: nextId++, message: textMessage("/start", OWNER, { id: OWNER, type: "group", title: "g" }) }],
    ["pesan bertanda pemilik di DM akun lain", { update_id: nextId++, message: textMessage("/start", OWNER, dm(STRANGER)) }],
  ];
}

const ME_ID = 999000;
