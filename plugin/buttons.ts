// Tombol pilihan dari Claude (tiket 261114101206). Diadaptasi dari mirza-bots
// (cc-plugin/src/engine/messages.ts): batas 64 byte callback_data, tombol
// bernomor wajib punya daftar bernomor di badan pesan, tombol jawab-sendiri
// ditempel mesin di setiap keyboard, dan pesan yang ditekan ditandai
// pilihannya lalu keyboard-nya dicopot.

/** Satu tombol seperti yang ditulis Claude. `data` bawaan = `text`. */
export type ChoiceButton = { text: string; data: string }
export type ChoiceRows = ChoiceButton[][]

/** Batas Telegram untuk callback_data, dalam BYTE (UTF-8). */
export const MAX_CALLBACK_DATA_BYTES = 64

/**
 * Awalan callback_data tombol pilihan. Tombol izin memakai `perm:`, jadi
 * tombol Claude tidak pernah bisa menyamar sebagai jawaban izin.
 */
export const CHOICE_PREFIX = 'c:'
export const MAX_CHOICE_DATA_BYTES = MAX_CALLBACK_DATA_BYTES - Buffer.byteLength(CHOICE_PREFIX)

/** Batas Telegram: 8 tombol per baris, 100 tombol per keyboard. */
const MAX_PER_ROW = 8
const MAX_TOTAL = 100

/** Persis mirza-bots (keputusan pemilik Q1 opsi B, 2026-11-14). */
export const MANUAL_FALLBACK_BUTTON: ChoiceButton = {
  text: '✏️ Explain manually',
  data: 'let me explain manually instead',
}

export class ButtonError extends Error {}

/**
 * Ubah parameter `buttons` alat reply menjadi baris tombol. Terima daftar
 * baris (`[[{text,data?}]]`); tombol tunggal di tingkat atas dianggap satu
 * baris sendiri. Melempar ButtonError dengan cara memperbaikinya.
 */
export function parseButtons(raw: unknown): ChoiceRows {
  if (raw == null) return []
  if (!Array.isArray(raw)) throw new ButtonError('buttons must be an array of rows, e.g. [[{"text":"1"},{"text":"2"}]]. Nothing was sent.')
  const rows: ChoiceRows = []
  for (const entry of raw) {
    const row = Array.isArray(entry) ? entry : [entry]
    const out: ChoiceButton[] = []
    for (const b of row) {
      const text = typeof b === 'string' ? b : (b as { text?: unknown })?.text
      if (typeof text !== 'string' || text.trim() === '') {
        throw new ButtonError('every button needs a non-empty "text" label. Nothing was sent.')
      }
      const rawData = typeof b === 'object' && b !== null ? (b as { data?: unknown }).data : undefined
      if (rawData != null && typeof rawData !== 'string') {
        throw new ButtonError(`button "${text}": "data" must be a string. Nothing was sent.`)
      }
      const data = rawData == null || rawData === '' ? text : rawData
      out.push({ text, data })
    }
    if (out.length > 0) rows.push(out)
  }
  return rows
}

/**
 * Tempel tombol jawab-sendiri sebagai baris terakhir. Keyboard kosong tetap
 * kosong. Kalau Claude menulisnya sendiri (dikenali dari data atau label),
 * tombol itu dibuang dulu, jadi tombolnya selalu satu dan selalu terakhir.
 */
export function withManualFallback(rows: ChoiceRows): ChoiceRows {
  const isManual = (b: ChoiceButton) =>
    b.data === MANUAL_FALLBACK_BUTTON.data || b.text.trim() === MANUAL_FALLBACK_BUTTON.text
  const own = rows.map(r => r.filter(b => !isManual(b))).filter(r => r.length > 0)
  if (rows.length === 0) return rows
  return [...own, [{ ...MANUAL_FALLBACK_BUTTON }]]
}

/**
 * Pagar sebelum apa pun terkirim. `null` berarti boleh dikirim; selain itu
 * pesan error untuk Claude yang menyebut cara memperbaikinya. Dijalankan atas
 * keyboard SETELAH tombol jawab-sendiri ditempel.
 */
export function checkButtons(text: string, rows: ChoiceRows): string | null {
  for (const row of rows) {
    if (row.length > MAX_PER_ROW) {
      return `too_many_buttons_in_row: Telegram allows at most ${MAX_PER_ROW} buttons per row, one row has ${row.length}. Split it into several rows. Nothing was sent.`
    }
  }
  const all = rows.flat()
  if (all.length > MAX_TOTAL) {
    return `too_many_buttons: Telegram allows at most ${MAX_TOTAL} buttons per message (including the automatic "${MANUAL_FALLBACK_BUTTON.text}"), got ${all.length}. Nothing was sent.`
  }
  for (const b of all) {
    const bytes = Buffer.byteLength(b.data, 'utf8')
    if (bytes > MAX_CHOICE_DATA_BYTES) {
      return (
        `callback_data_too_long: button "${b.text}" carries ${bytes} bytes of data, but at most ` +
        `${MAX_CHOICE_DATA_BYTES} fit (Telegram's limit is ${MAX_CALLBACK_DATA_BYTES} bytes, ` +
        `the plugin uses ${Buffer.byteLength(CHOICE_PREFIX)}). Bytes, not characters: an emoji costs 4. ` +
        `Without "data" the label is used as data, so a long label needs a short "data" ` +
        `(e.g. {"text":"...","data":"opt1"}). Nothing was sent - fix and resend.`
      )
    }
  }
  return findMissingButtonNarration(text, rows)
}

/**
 * Tombol berlabel angka saja (minimal dua) wajib punya baris bernomor yang
 * cocok di badan pesan ("1. ..." atau "1) ..." di awal baris). Aturan sama
 * dengan mirza-bots.
 */
export function findMissingButtonNarration(text: string, rows: ChoiceRows): string | null {
  const numeric = rows.flat().map(b => b.text.trim()).filter(t => /^\d+$/.test(t))
  if (numeric.length < 2) return null
  const missing = [...new Set(numeric)].filter(
    n => !new RegExp(`^[^\\S\\r\\n]*${n}[.)]`, 'm').test(text),
  )
  if (missing.length === 0) return null
  return (
    `numbered_buttons_without_list: numeric button labels need a matching numbered line in the ` +
    `message text, and ${missing.map(n => `"${n}"`).join(', ')} ` +
    `${missing.length === 1 ? 'has' : 'have'} none. Either add one line per number to the text ` +
    `(e.g. "1. Lanjut backup" / "2. Batalkan"), or use short descriptive labels instead ` +
    `(e.g. "✅ Ya" / "❌ Tidak"). Nothing was sent - fix and resend.`
  )
}

/** reply_markup Telegram untuk baris tombol (data diberi awalan plugin). */
export function toInlineKeyboard(rows: ChoiceRows): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  return {
    inline_keyboard: rows.map(r => r.map(b => ({ text: b.text, callback_data: CHOICE_PREFIX + b.data }))),
  }
}

/** Data pilihan dari callback_data, atau null kalau bukan tombol pilihan. */
export function parseChoiceData(callbackData: string): string | null {
  return callbackData.startsWith(CHOICE_PREFIX) ? callbackData.slice(CHOICE_PREFIX.length) : null
}

type KeyboardLike = { inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>> } | undefined

/**
 * Label tombol yang ditekan, dicari di keyboard pesan itu. `null` kalau
 * tombolnya sudah tidak ada (keyboard sudah dicopot): ketukan itu diabaikan.
 */
export function findTappedLabel(markup: KeyboardLike, callbackData: string): string | null {
  for (const row of markup?.inline_keyboard ?? []) {
    for (const b of row) if (b.callback_data === callbackData) return b.text ?? null
  }
  return null
}

export function isManualChoice(data: string): boolean {
  return data === MANUAL_FALLBACK_BUTTON.data
}

/** Isi notifikasi untuk Claude saat sebuah tombol ditekan. */
export function choiceContent(data: string): string {
  if (isManualChoice(data)) {
    return (
      `(The user tapped "${MANUAL_FALLBACK_BUTTON.text}": none of the offered options fits. ` +
      `They will type their own answer in their next message. Wait for it; do not pick an option for them.)`
    )
  }
  return data
}

type Entity = { type: string; offset: number; length: number; [k: string]: unknown }

/**
 * Teks pesan setelah tombol ditekan: teks asli, lalu `→ <label>`. Entity asli
 * dipertahankan (offset UTF-16 tidak bergeser karena hanya ditambah di
 * belakang). `null` kalau pesan bukan teks atau hasilnya melewati 4096.
 */
export function buildTappedEdit(
  message: { text?: string; entities?: Entity[] } | undefined,
  label: string,
): { text: string; entities?: Entity[] } | null {
  if (typeof message?.text !== 'string') return null
  const text = `${message.text}\n\n→ ${label}`
  if (text.length > 4096) return null
  return message.entities?.length ? { text, entities: message.entities } : { text }
}

/** Instruksi MCP tentang tombol. */
export const BUTTONS_INSTRUCTIONS =
  'To offer choices, pass buttons to reply: rows of {text, data?}, e.g. [[{"text":"1"},{"text":"2"}]]. Prefer bare numbers as labels with a numbered list ("1. ...", "2. ...") in the text; numeric labels without matching numbered lines are rejected, and so is data over 62 bytes (data defaults to the label). The plugin always adds a last button "✏️ Explain manually" itself; never add it yourself. When the user taps a button it arrives as a normal channel message whose content is the button data, with meta button_data, button_label and button_message_id; the buttons are then removed and the message marked with the choice, so each keyboard is answered once. If the content says the user tapped "✏️ Explain manually", wait for their next message instead of choosing.'
