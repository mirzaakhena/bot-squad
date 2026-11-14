// Album (media group) dari Telegram diteruskan ke Claude sebagai SATU pesan
// (tiket 261114101204). Telegram mengirim album sebagai beberapa pesan
// terpisah dengan media_group_id yang sama; tanpa penggabungan Claude bisa
// menjawab foto pertama sebelum foto berikutnya datang.
//
// Angka dari mirza-bots (AlbumBuffer di cc-plugin engine.ts): tunggu 1,5 detik
// sejak item terakhir, batas keras 8 detik sejak item pertama, maks. 10 item
// per pesan (kelebihannya menjadi pesan berikutnya, tidak pernah dibuang).
// Hanya pesan yang punya media_group_id yang masuk sini; foto tunggal dan teks
// tidak pernah ditunda.

import { tooLargeNote } from './attachment.ts'

export const ALBUM_DEBOUNCE_MS = 1500
export const ALBUM_HARD_CAP_MS = 8000
export const ALBUM_MAX_ITEMS = 10

type Timer = unknown

export type AlbumBufferOptions<T> = {
  onFlush: (key: string, items: T[]) => void
  debounceMs?: number
  hardCapMs?: number
  maxItems?: number
  setTimer?: (fn: () => void, ms: number) => Timer
  clearTimer?: (t: Timer) => void
}

export type AlbumBuffer<T> = {
  add(key: string, item: T): void
  flush(key: string): void
  /** Membuang semua yang menunggu tanpa onFlush; mengembalikan item yang dibuang. */
  stopAll(): T[]
  pending(): number
}

export function createAlbumBuffer<T>(opts: AlbumBufferOptions<T>): AlbumBuffer<T> {
  const debounceMs = opts.debounceMs ?? ALBUM_DEBOUNCE_MS
  const hardCapMs = opts.hardCapMs ?? ALBUM_HARD_CAP_MS
  const maxItems = opts.maxItems ?? ALBUM_MAX_ITEMS
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? (t => clearTimeout(t as ReturnType<typeof setTimeout>))
  type Bucket = { items: T[]; debounce: Timer; hardCap: Timer }
  const buckets = new Map<string, Bucket>()

  function flush(key: string): void {
    const b = buckets.get(key)
    if (!b) return
    clearTimer(b.debounce)
    clearTimer(b.hardCap)
    buckets.delete(key)
    opts.onFlush(key, b.items)
  }

  return {
    add(key, item) {
      let b = buckets.get(key)
      if (!b) {
        b = {
          items: [],
          debounce: setTimer(() => flush(key), debounceMs),
          hardCap: setTimer(() => flush(key), hardCapMs),
        }
        buckets.set(key, b)
      } else {
        clearTimer(b.debounce)
        b.debounce = setTimer(() => flush(key), debounceMs)
      }
      b.items.push(item)
      if (b.items.length >= maxItems) flush(key)
    },
    flush,
    stopAll() {
      const dropped: T[] = []
      for (const b of buckets.values()) {
        clearTimer(b.debounce)
        clearTimer(b.hardCap)
        dropped.push(...b.items)
      }
      buckets.clear()
      return dropped
    },
    pending: () => buckets.size,
  }
}

/** Satu item album setelah foto-fotonya dicoba diunduh. */
export type AlbumEntry = {
  messageId: number
  /** 'photo', atau jenis lampiran ('video', 'document', 'audio', ...). */
  kind: string
  caption?: string
  /** Foto: path hasil unduhan; undefined berarti gagal diunduh. */
  imagePath?: string
  /** Selain foto: lampiran yang bisa diunduh lewat download_attachment. */
  attachment?: {
    file_id: string
    size?: number
    mime?: string
    /** Sudah lewat safeName(). */
    name?: string
    tooLarge: boolean
  }
}

const LABELS: Record<string, string> = {
  photo: 'Photo',
  video: 'Video',
  document: 'Document',
  audio: 'Audio',
  voice: 'Voice message',
  video_note: 'Video note',
  sticker: 'Sticker',
}

function label(kind: string): string {
  return LABELS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1)
}

/** Urutan album: message_id menaik, bukan urutan tiba. */
export function sortAlbum<T extends { messageId: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.messageId - b.messageId)
}

/**
 * Isi dan meta untuk satu album yang sudah diurutkan. Nomor item = posisi di
 * album (1..n). Meta hanya berisi kunci huruf, angka, dan garis bawah.
 *
 * content:
 *   (album of 3 items)
 *   Photo 1: <kapsi>
 *   Photo 2 (download failed)
 *   Video 3 "clip.mp4": <kapsi>
 *   (photo 2 could not be downloaded — tell the sender)
 *
 * meta: album_size, album_message_ids, image_path (foto pertama yang berhasil,
 * kompatibel dengan pesan foto tunggal), image_path_<n>, album_failed,
 * attachment_<n>_{kind,file_id|too_large,size,mime,name}.
 */
export function buildAlbum(entries: AlbumEntry[]): { content: string; meta: Record<string, string> } {
  const lines = [`(album of ${entries.length} items)`]
  const notes: string[] = []
  const meta: Record<string, string> = {
    album_size: String(entries.length),
    album_message_ids: entries.map(e => e.messageId).join(','),
  }
  const failed: number[] = []
  entries.forEach((e, i) => {
    const n = i + 1
    let head = `${label(e.kind)} ${n}`
    if (e.kind === 'photo') {
      if (e.imagePath) {
        if (meta.image_path == null) meta.image_path = e.imagePath
        meta[`image_path_${n}`] = e.imagePath
      } else {
        failed.push(n)
        head += ' (download failed)'
      }
    } else if (e.attachment) {
      const a = e.attachment
      if (a.name) head += ` "${a.name}"`
      meta[`attachment_${n}_kind`] = e.kind
      if (a.tooLarge) {
        meta[`attachment_${n}_too_large`] = 'true'
        notes.push(`${label(e.kind)} ${n}: ${tooLargeNote(e.kind, a.name, a.size)}`)
      } else {
        meta[`attachment_${n}_file_id`] = a.file_id
      }
      if (a.size != null) meta[`attachment_${n}_size`] = String(a.size)
      if (a.mime) meta[`attachment_${n}_mime`] = a.mime
      if (a.name) meta[`attachment_${n}_name`] = a.name
    }
    lines.push(e.caption ? `${head}: ${e.caption}` : head)
  })
  if (failed.length > 0) {
    meta.album_failed = failed.join(',')
    const which = failed.length === 1 ? `photo ${failed[0]}` : `photos ${failed.join(', ')}`
    notes.push(`(${which} could not be downloaded — tell the sender; the other items arrived)`)
  }
  return { content: [...lines, ...notes].join('\n'), meta }
}
