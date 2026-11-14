/**
 * Indikator "typing…" yang bertahan sepanjang giliran (tiket 261114101201).
 *
 * Telegram memadamkan chat action ~5 detik setelah dikirim, padahal giliran
 * Claude biasanya jauh lebih lama. Jadi indikator dikirim ulang setiap 4 detik
 * sampai balasan pertama ke chat itu, dengan batas aman 300 detik supaya
 * giliran yang berakhir tanpa reply tidak meninggalkan "typing…" tanpa akhir.
 * Sama dengan mirza-bots (cc-plugin/src/engine/typing.ts).
 *
 * Timer dan jam disuntik supaya bisa diuji tanpa menunggu waktu sungguhan.
 */

/** Jeda antar chat action, di bawah masa hidup indikator (~5 detik). */
export const TYPING_PING_INTERVAL_MS = 4_000

/** Batas satu keepalive, dihitung dari pesan masuk terakhir di chat itu. */
export const TYPING_MAX_MS = 300_000

/** Reaksi tanda diterima kalau `ackReaction` di access.json tidak diisi. */
export const DEFAULT_ACK_REACTION = '👀'

/**
 * Emoji reaksi tanda diterima: `ackReaction` dari access.json, atau 👀 kalau
 * tidak diisi. String kosong mematikannya (null).
 */
export function ackEmoji(configured: string | undefined | null): string | null {
  if (configured == null) return DEFAULT_ACK_REACTION
  return configured === '' ? null : configured
}

export interface TypingDeps {
  send: (chatId: string) => unknown
  intervalMs?: number
  maxMs?: number
  setInterval?: (fn: () => void, ms: number) => unknown
  clearInterval?: (handle: unknown) => void
  now?: () => number
}

export interface TypingKeepalive {
  /** Kirim indikator sekarang dan terus memperbaruinya; memperpanjang batas kalau sudah hidup. */
  start(chatId: string): void
  stop(chatId: string): void
  stopAll(): void
  active(chatId: string): boolean
}

export function createTypingKeepalive(deps: TypingDeps): TypingKeepalive {
  const intervalMs = deps.intervalMs ?? TYPING_PING_INTERVAL_MS
  const maxMs = deps.maxMs ?? TYPING_MAX_MS
  const setTimer = deps.setInterval ?? ((fn, ms) => setInterval(fn, ms))
  const clearTimer = deps.clearInterval ?? (h => clearInterval(h as ReturnType<typeof setInterval>))
  const now = deps.now ?? (() => Date.now())
  const live = new Map<string, { handle: unknown; until: number }>()

  // Gagal kirim (429, jaringan, bot diblokir) tidak boleh menggagalkan
  // penerusan pesan: ditelan, baik yang throw sinkron maupun promise reject.
  const ping = (chatId: string): void => {
    try {
      const r = deps.send(chatId) as { catch?: (f: () => void) => unknown } | undefined
      if (r && typeof r.catch === 'function') r.catch(() => {})
    } catch {}
  }

  const stop = (chatId: string): void => {
    const entry = live.get(chatId)
    if (!entry) return
    clearTimer(entry.handle)
    live.delete(chatId)
  }

  return {
    start(chatId) {
      ping(chatId)
      const existing = live.get(chatId)
      if (existing) {
        existing.until = now() + maxMs
        return
      }
      const handle = setTimer(() => {
        const entry = live.get(chatId)
        if (!entry || now() >= entry.until) {
          stop(chatId)
          return
        }
        ping(chatId)
      }, intervalMs)
      live.set(chatId, { handle, until: now() + maxMs })
    },
    stop,
    stopAll() {
      for (const chatId of [...live.keys()]) stop(chatId)
    },
    active: chatId => live.has(chatId),
  }
}
