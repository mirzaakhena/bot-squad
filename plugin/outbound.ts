// Jalur pesan keluar (tiket 261114101205): Markdown biasa diubah otomatis ke
// MarkdownV2 Telegram, balasan panjang dipotong, blok kode yang terpotong
// dijahit ulang, dan potongan yang formatnya ditolak Telegram dikirim ulang
// sebagai teks biasa. Diadaptasi dari mirza-bots (cc-plugin/src/engine/
// markdown.ts dan chunk.ts).

import telegramifyMarkdown from 'telegramify-markdown'

/** Batas keras Telegram untuk satu pesan teks. */
export const TELEGRAM_MAX_CHARS = 4096

export type ReplyFormat = 'markdown' | 'markdownv2' | 'text'
export type ParseMode = 'MarkdownV2' | undefined

/** Satu pesan Telegram yang siap dikirim. */
export type OutboundPart = {
  /** Yang dikirim ke Telegram. */
  text: string
  /** undefined = teks biasa. */
  parseMode: ParseMode
  /** Dikirim kalau Telegram menolak format `text` (teks aslinya, tanpa parse_mode). */
  plain: string
}

export function normalizeFormat(value: unknown): ReplyFormat {
  return value === 'markdownv2' || value === 'text' ? value : 'markdown'
}

/**
 * CommonMark -> MarkdownV2. Mode "escape": karakter yang tidak punya padanan di
 * Telegram (tabel `|`, garis `---`) di-escape, bukan dibiarkan (Telegram akan
 * menolak seluruh pesan) dan bukan dihapus (isi hilang).
 */
export function toMarkdownV2(input: string): string {
  if (!input) return ''
  return telegramifyMarkdown(input, 'escape').replace(/\n+$/, '')
}

/**
 * Potong teks per panjang. Mode 'newline' memilih batas paragraf, lalu baris,
 * lalu spasi. Sama dengan chunk() lama di server.ts.
 */
export function chunkText(text: string, limit: number, mode: 'length' | 'newline'): string[] {
  if (text.length <= limit) return [text]
  const out: string[] = []
  let rest = text
  while (rest.length > limit) {
    let cut = limit
    if (mode === 'newline') {
      const para = rest.lastIndexOf('\n\n', limit)
      const line = rest.lastIndexOf('\n', limit)
      const space = rest.lastIndexOf(' ', limit)
      cut = para > limit / 2 ? para : line > limit / 2 ? line : space > 0 ? space : limit
    }
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^\n+/, '')
  }
  if (rest) out.push(rest)
  return out
}

function matchFence(line: string): { ticks: number; info: string } | null {
  const m = /^ {0,3}(`{3,})(.*)$/.exec(line)
  return m ? { ticks: m[1]!.length, info: m[2]! } : null
}

/**
 * Jahit ulang blok kode berpagar yang terpotong: fence yang masih terbuka di
 * akhir potongan ditutup di situ, lalu baris pembukanya (bahasa ikut) dibuka
 * lagi di awal potongan berikutnya. Tanpa ini, potongan berikutnya membaca
 * ``` penutup sebagai pembuka dan sisa pesan menjadi satu blok kode.
 */
export function balanceFences(parts: string[]): string[] {
  let open: { line: string; ticks: number } | null = null
  return parts.map(part => {
    let text = open !== null ? `${open.line}\n${part}` : part
    let scan: { line: string; ticks: number } | null = null
    for (const line of text.split('\n')) {
      const fence = matchFence(line)
      if (!fence) continue
      if (scan === null) scan = { line, ticks: fence.ticks }
      else if (fence.ticks >= scan.ticks && fence.info.trim() === '') scan = null
    }
    if (scan !== null) text = `${text}\n${'`'.repeat(scan.ticks)}`
    open = scan
    return text
  })
}

/**
 * Rencanakan pesan keluar untuk satu balasan. Setiap `text` <= limit.
 * Potongan pertama selalu di indeks 0 (kutipan balasan menempel di sana).
 *
 * - 'markdown': kalau hasil konversi utuh muat, satu pesan. Kalau tidak, teks
 *   MENTAH yang dipotong (jendela setengah limit, karena escape membengkakkan
 *   teks), fence dijahit, lalu tiap potongan dikonversi sendiri. Memotong hasil
 *   konversi bisa membelah satu entity dan Telegram menolak potongannya.
 *   Potongan yang hasil konversinya tetap melewati limit dikirim sebagai teks
 *   biasa.
 * - 'markdownv2': teks diteruskan apa adanya (pemanggil yang meng-escape).
 * - 'text': teks biasa.
 */
export function planReply(
  text: string,
  format: ReplyFormat,
  limit: number,
  chunkMode?: 'length' | 'newline',
): OutboundPart[] {
  // Tanpa chunkMode di access.json: 'markdown' memotong di batas paragraf,
  // baris, atau spasi (baris kode tidak terbelah); format lain tetap per
  // panjang seperti dulu. chunkMode yang ditulis eksplisit selalu dihormati.
  const mode = chunkMode ?? (format === 'markdown' ? 'newline' : 'length')
  if (format !== 'markdown') {
    const parseMode: ParseMode = format === 'markdownv2' ? 'MarkdownV2' : undefined
    return chunkText(text, limit, mode).map(t => ({ text: t, parseMode, plain: t }))
  }
  const whole = toMarkdownV2(text)
  if (whole.length <= limit) {
    return [whole ? { text: whole, parseMode: 'MarkdownV2', plain: text } : { text, parseMode: undefined, plain: text }]
  }
  const window = Math.max(1, Math.floor(limit / 2))
  const out: OutboundPart[] = []
  for (const raw of balanceFences(chunkText(text, window, mode))) {
    const converted = toMarkdownV2(raw)
    if (converted && converted.length <= limit) {
      out.push({ text: converted, parseMode: 'MarkdownV2', plain: raw })
    } else {
      // Fence tambahan bisa membuat potongan mentah melewati limit kecil.
      for (const piece of chunkText(raw, limit, mode)) out.push({ text: piece, parseMode: undefined, plain: piece })
    }
  }
  return out
}

/**
 * Pesan edit tidak bisa dipotong: kalau hasil konversi melewati batas, kirim
 * teks aslinya sebagai teks biasa (Telegram yang menolak kalau masih terlalu
 * panjang).
 */
export function planEdit(text: string, format: ReplyFormat): OutboundPart {
  if (format === 'text') return { text, parseMode: undefined, plain: text }
  if (format === 'markdownv2') return { text, parseMode: 'MarkdownV2', plain: text }
  const converted = toMarkdownV2(text)
  return converted && converted.length <= TELEGRAM_MAX_CHARS
    ? { text: converted, parseMode: 'MarkdownV2', plain: text }
    : { text, parseMode: undefined, plain: text }
}

/** Telegram menolak format pesan (400 "can't parse entities" dan sejenisnya). */
export function isFormatRejection(err: unknown): boolean {
  const e = err as { error_code?: unknown; description?: unknown; message?: unknown }
  if (e?.error_code !== 400) return false
  const desc = String(e.description ?? e.message ?? '')
  return /can't parse entities|can't find end of|reserved and must be escaped/i.test(desc)
}

/**
 * Kirim satu potongan. Kalau formatnya ditolak Telegram, kirim ulang sebagai
 * teks biasa supaya balasan tidak hilang. Error lain dilempar apa adanya.
 */
export async function sendWithFallback<T>(
  part: OutboundPart,
  send: (text: string, parseMode: ParseMode) => Promise<T>,
  onFallback?: (err: unknown) => void,
): Promise<T> {
  if (!part.parseMode) return send(part.text, undefined)
  try {
    return await send(part.text, part.parseMode)
  } catch (err) {
    if (!isFormatRejection(err)) throw err
    onFallback?.(err)
    return send(part.plain, undefined)
  }
}

/** Deskripsi parameter `format` di alat reply dan edit_message. */
export const FORMAT_DESCRIPTION =
  "Rendering mode. Default 'markdown': write ordinary Markdown (**bold**, *italic*, `code`, ``` fenced blocks, [links](url), lists); it is converted to Telegram formatting and special characters are escaped automatically. If Telegram still rejects the formatting, the text is sent plain instead. 'text': plain, no formatting. 'markdownv2': raw Telegram MarkdownV2, caller escapes."
