// Ketukan tombol pilihan (tiket 261114101206): diteruskan ke Claude seperti
// pesan masuk, lalu keyboard dicopot dan pesannya ditandai pilihan itu.
// Dipisah dari server.ts supaya kaitnya kecil.

import type { Context } from 'grammy'
import {
  MANUAL_FALLBACK_BUTTON,
  buildTappedEdit,
  choiceContent,
  findTappedLabel,
  isManualChoice,
  parseChoiceData,
} from './buttons.ts'

export type ChoiceTapDeps = {
  /** Pengirim boleh menekan tombol (allowFrom bot ini). */
  allowed: (senderId: string) => boolean
  deliver: (content: string, meta: Record<string, string>) => Promise<unknown>
  typingStart: (chatId: string) => void
  log: (fields: Record<string, string | number | undefined>) => void
  describeError: (err: unknown) => string
}

// Pesan yang sudah dijawab, supaya dua ketukan cepat sebelum keyboard
// dicopot tidak terkirim dua kali. Dibatasi supaya tidak tumbuh terus.
const answered = new Set<string>()
const MAX_REMEMBERED = 1000

function remember(key: string): boolean {
  if (answered.has(key)) return false
  answered.add(key)
  if (answered.size > MAX_REMEMBERED) answered.delete(answered.values().next().value as string)
  return true
}

/** `true` kalau callback ini tombol pilihan (sudah ditangani di sini). */
export async function handleChoiceTap(ctx: Context, deps: ChoiceTapDeps): Promise<boolean> {
  const cq = ctx.callbackQuery
  if (!cq?.data) return false
  const data = parseChoiceData(cq.data)
  if (data === null) return false

  const senderId = String(cq.from.id)
  const msg = cq.message
  const chatId = msg ? String(msg.chat.id) : senderId
  const msgId = msg?.message_id
  const q = (s: string) => JSON.stringify(s)

  if (!deps.allowed(senderId)) {
    await ctx.answerCallbackQuery({ text: 'Not authorized.' }).catch(() => {})
    deps.log({ hasil: 'dibuang', chat: chatId, msg: msgId, dari: senderId })
    return true
  }

  const markup = msg && 'reply_markup' in msg ? msg.reply_markup : undefined
  const label = findTappedLabel(markup, cq.data)
  if (label === null || msgId == null || !remember(`${chatId}:${msgId}`)) {
    // Keyboard sudah dicopot atau pesan sudah dijawab: abaikan.
    await ctx.answerCallbackQuery().catch(() => {})
    deps.log({ hasil: 'ganda', chat: chatId, msg: msgId })
    return true
  }

  await ctx.answerCallbackQuery({ text: `→ ${label}`.slice(0, 200) }).catch(() => {})

  const manual = isManualChoice(data)
  const from = cq.from
  deps.typingStart(chatId)
  try {
    await deps.deliver(choiceContent(data), {
      chat_id: chatId,
      user: from.username ?? String(from.id),
      user_id: String(from.id),
      ts: new Date().toISOString(),
      button_message_id: String(msgId),
      button_data: data,
      button_label: label,
      ...(manual ? { button_manual: 'true' } : {}),
    })
    deps.log({ hasil: manual ? 'jawab-sendiri' : 'diteruskan', chat: chatId, msg: msgId })
  } catch (err) {
    deps.log({ hasil: 'gagal', chat: chatId, msg: msgId, alasan: q(deps.describeError(err)) })
  }

  // Terakhir dengan sengaja: Telegram bisa menolak edit (pesan terlalu tua,
  // sudah diedit), dan itu tidak boleh menunda atau menghilangkan pilihannya.
  const shown = manual ? MANUAL_FALLBACK_BUTTON.text : label
  const edit = buildTappedEdit(msg && 'text' in msg ? msg : undefined, shown)
  let removed = false
  if (edit) {
    removed = await ctx
      .editMessageText(edit.text, edit.entities ? { entities: edit.entities as never } : undefined)
      .then(() => true, () => false)
  }
  if (!removed) {
    // Pesan bukan teks atau terlalu panjang untuk ditandai: copot tombolnya saja.
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => {})
  }
  return true
}
