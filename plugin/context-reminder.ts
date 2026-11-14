/**
 * bot-squad: pengingat saat konteks sesi bot menipis (tiket 261114101207).
 *
 * Mengikuti `context-low` di mirza-bots (cc-plugin/src/engine/reminders.ts):
 * pemicunya KEADAAN, bukan peristiwa. Setiap pesan pemilik yang diteruskan ke
 * Claude membaca <state>/status.json saat itu juga; selama konteks terpakai di
 * atas ambang, pesan itu membawa pengingat, dan begitu di bawah ambang (mis.
 * setelah /clear) pengingatnya hilang sendiri. Tidak ada flag "sudah
 * diingatkan", dan pengingat tidak pernah dikirim sendirian: ia hanya atribut
 * meta pada notifikasi pesan yang memang datang.
 *
 * Ambang (keputusan pemilik Q1, 2026-11-14): di atas 400 ribu token terpakai
 * ATAU di atas 50% jendela konteks, mana yang lebih dulu.
 *
 * Data tidak ada, rusak, atau belum berangka (sesi baru sebelum giliran
 * pertama, sesudah /compact) berarti TIDAK ada pengingat: pengingat yang
 * berbunyi karena datanya tidak ada akan berbunyi di awal setiap sesi.
 */
import { join } from 'node:path'
import { formatTokens } from './context-render.ts'
import { readCapturedStatus, STATUS_FILE, type ReadStatus } from './context.ts'

/** Token terpakai yang di atasnya pengingat menyala (sama dengan mirza-bots). */
export const MAX_CONTEXT_USED = 400_000
/** Persen jendela konteks yang di atasnya pengingat menyala. */
export const MAX_CONTEXT_PERCENT = 50

/** Nama atribut meta pada tag <channel>. */
export const REMINDER_META_KEY = 'context_reminder'

export type ContextUsage = {
  /** Token terpakai (total_input_tokens), atau null kalau tidak ada. */
  used: number | null
  /** Ukuran jendela (context_window_size), atau null kalau tidak ada. */
  size: number | null
  /** Persen terpakai, dari used_percentage atau used/size. */
  percent: number
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Angka konteks dari tangkapan statusline, atau null kalau tidak bisa
 * dipastikan. Murni, supaya seluruh matriksnya bisa diuji tanpa berkas.
 */
export function contextUsage(read: ReadStatus): ContextUsage | null {
  if (read.kind !== 'ok') return null
  const cw = read.status.payload?.context_window
  if (typeof cw !== 'object' || cw === null) return null
  const used = num(cw.total_input_tokens)
  const rawSize = num(cw.context_window_size)
  const size = rawSize !== null && rawSize > 0 ? rawSize : null
  const pct = num(cw.used_percentage)
  // used_percentage null = Claude Code sendiri belum punya angka (sesi baru,
  // sesudah /compact). total_input_tokens bernilai 0 saat itu, jadi bukan bukti.
  if (pct === null) return null
  return { used: used !== null ? Math.max(0, used) : null, size, percent: pct }
}

export function overThreshold(u: ContextUsage): boolean {
  if (u.percent > MAX_CONTEXT_PERCENT) return true
  if (u.used !== null && u.used > MAX_CONTEXT_USED) return true
  // used_percentage dibulatkan Claude Code; hitung sendiri kalau bisa.
  if (u.used !== null && u.size !== null && (u.used / u.size) * 100 > MAX_CONTEXT_PERCENT) return true
  return false
}

/**
 * Teks pengingat. Hanya huruf, angka, dan tanda baca biasa: tidak ada tanda
 * kutip, kurung sudut, kurung siku, atau titik koma, supaya aman sebagai nilai
 * atribut tag <channel>.
 */
export function reminderText(u: ContextUsage): string {
  const pct = `${Math.round(u.percent)}%`
  const amount =
    u.used !== null && u.size !== null
      ? `${formatTokens(u.used)} dari ${formatTokens(u.size)} token (${pct})`
      : u.used !== null
        ? `${formatTokens(u.used)} token (${pct})`
        : pct
  return (
    `Konteks sesi ini sudah terpakai ${amount}, di atas ambang ` +
    `${formatTokens(MAX_CONTEXT_USED)} token atau ${MAX_CONTEXT_PERCENT}% jendela, ` +
    `dan kualitas jawaban bisa mulai menurun. Beri tahu pemilik dalam balasanmu ` +
    `dan tawarkan memulai percakapan baru. Keputusannya milik pemilik, jangan putuskan sendiri.`
  )
}

/** Pengingat untuk tangkapan ini, atau undefined kalau tidak perlu atau tidak pasti. */
export function reminderFor(read: ReadStatus): string | undefined {
  const u = contextUsage(read)
  if (u === null || !overThreshold(u)) return undefined
  return reminderText(u)
}

/**
 * Atribut meta untuk notifikasi pesan masuk: `{ context_reminder }` atau `{}`.
 * Tidak pernah melempar: pengingat tidak boleh menjadi alasan pesan tidak sampai.
 */
export function contextReminderMeta(stateDir: string): Record<string, string> {
  try {
    const text = reminderFor(readCapturedStatus(join(stateDir, STATUS_FILE)))
    return text ? { [REMINDER_META_KEY]: text } : {}
  } catch {
    return {}
  }
}
