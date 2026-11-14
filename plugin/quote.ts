/**
 * bot-squad: kutipan pesan masuk (tiket 261114101202).
 *
 * Saat pemilik membalas sebuah pesan (kutip penuh atau seleksi sebagian),
 * Claude menerima id pesan yang dikutip dan teks kutipannya lewat meta
 * notifikasi <channel>, bukan lewat content. Mengikuti mirza-bots
 * (cc-plugin/src/engine/telegram/quote.ts):
 *
 *   message.quote.text (seleksi, is_manual)  ->  reply_to_message.text
 *   ->  reply_to_message.caption  ->  keterangan jenis pesan yang dikutip.
 *
 * `external_reply` (kutipan pesan dari chat lain) sengaja diabaikan: id-nya
 * milik penomoran chat lain, jadi tidak bisa dipakai sebagai reply_to.
 *
 * Teks kutipan bisa berisi apa saja (juga teks yang dulu ditulis orang lain),
 * jadi dibersihkan seperti nama berkas (safeName di server.ts) supaya tidak
 * bisa keluar dari tag atau memalsukan atribut seperti image_path.
 *
 * Nol-import supaya bisa dites tanpa grammY.
 */

/** Batas panjang teks kutipan di meta (karakter); lebih dari itu dipotong dengan "…". */
export const QUOTE_MAX = 1000

// Struktural, bukan tipe Message grammY: cukup field yang dipakai.
type FileLike = { file_name?: string; title?: string }
export type QuotedMessage = {
  message_id?: number
  text?: string
  caption?: string
  photo?: unknown[]
  document?: FileLike
  voice?: unknown
  audio?: FileLike
  video?: FileLike
  video_note?: unknown
  sticker?: { emoji?: string }
  animation?: unknown
  forum_topic_created?: unknown
}
export type QuoteSource = {
  is_topic_message?: boolean
  quote?: { text?: string; is_manual?: boolean }
  reply_to_message?: QuotedMessage
}

/**
 * Karakter pembatas tag/atribut diganti `_`; baris baru menjadi `⏎` supaya
 * susunan baris tetap terbaca tanpa bisa membuka baris meta baru.
 */
export function sanitizeQuote(s: string): string {
  const clean = s
    .replace(/\r\n|\r|\n/g, ' ⏎ ')
    .replace(/[<>\[\];"\p{Cc}\u2028\u2029]/gu, '_')
  const chars = Array.from(clean)
  return chars.length > QUOTE_MAX ? chars.slice(0, QUOTE_MAX).join('') + '…' : clean
}

function fileLabel(f: FileLike | undefined): string | undefined {
  return f?.file_name ?? f?.title
}

/** Keterangan jenis untuk pesan dikutip yang tidak punya teks atau kapsi. */
export function describeQuoted(m: QuotedMessage): string {
  if (m.photo) return '(photo)'
  if (m.animation) return '(animation)'
  if (m.document) return `(document: ${fileLabel(m.document) ?? 'file'})`
  if (m.voice) return '(voice message)'
  if (m.audio) return `(audio: ${fileLabel(m.audio) ?? 'audio'})`
  if (m.video_note) return '(video note)'
  if (m.video) return `(video${fileLabel(m.video) ? `: ${fileLabel(m.video)}` : ''})`
  if (m.sticker) return `(sticker${m.sticker.emoji ? ` ${m.sticker.emoji}` : ''})`
  return '(message)'
}

/**
 * Atribut meta untuk kutipan, atau objek kosong kalau pesan ini tidak
 * membalas pesan lain di chat yang sama.
 *
 * - `reply_to_message_id`: id pesan yang dikutip.
 * - `quote_text`: teks yang dikutip (sudah dibersihkan dan dibatasi).
 * - `quote_is_manual`: "true" kalau pemilik menyeleksi sebagian teks,
 *   "false" kalau seluruh pesan dikutip.
 * - `quote_kind`: "text" kalau quote_text berasal dari teks/kapsi, "media"
 *   kalau berupa keterangan jenis seperti "(photo)".
 */
export function quoteMeta(message: QuoteSource | undefined): Record<string, string> {
  const replied = message?.reply_to_message
  if (!replied || replied.message_id == null) return {}
  // Di grup bertopik, setiap pesan topik "membalas" pesan pembuka topik.
  if (message!.is_topic_message && replied.forum_topic_created) return {}

  const manual = message!.quote?.text
  let text: string
  let kind: 'text' | 'media' = 'text'
  if (manual != null && manual !== '') text = manual
  else if (replied.text != null && replied.text !== '') text = replied.text
  else if (replied.caption != null && replied.caption !== '') text = replied.caption
  else { text = describeQuoted(replied); kind = 'media' }

  return {
    reply_to_message_id: String(replied.message_id),
    quote_text: sanitizeQuote(text),
    quote_is_manual: manual != null && manual !== '' && message!.quote?.is_manual === true ? 'true' : 'false',
    quote_kind: kind,
  }
}
