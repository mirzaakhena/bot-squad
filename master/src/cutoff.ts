import { GrammyError, HttpError, type Api } from "grammy";
import { describeError } from "./log.ts";

/**
 * Batas panggilan Telegram setelah master-bot diminta berhenti saat polling
 * sudah berjalan: bot.stop() grammY memanggil getUpdates sekali lagi tanpa
 * signal, dan panggilan itu bisa menggantung sampai batas client (500 detik)
 * kalau Telegram putus (tiket 261112235501).
 */
export const STOP_GRACE_MS = 2_000;

export type TelegramCutoff = {
  /** Memutus semua panggilan Telegram, yang sedang berjalan maupun berikutnya. */
  cut(): void;
  /** Memutus setelah `ms`; panggilan yang selesai lebih dulu tidak terganggu. */
  cutAfter(ms: number): void;
  /** Error jaringan/5xx terakhir (tanpa token disensor; sensor di pemanggil). */
  lastFailure(): string | undefined;
  /** Panggilan tertua yang masih menunggu jawaban. */
  oldestPending(): { method: string; since: number } | undefined;
};

/**
 * Memasang transformer di `api` yang menambahkan signal pemutus ke setiap
 * panggilan, dan mencatat kegagalan serta panggilan yang masih menunggu
 * supaya pesan saat berhenti bisa menjelaskan keadaan Telegram.
 */
export function installTelegramCutoff(api: Api, now: () => number = Date.now): TelegramCutoff {
  const hard = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failure: string | undefined;
  const pending = new Map<number, { method: string; since: number }>();
  let seq = 0;

  api.config.use(async (prev, method, payload, signal) => {
    const sig = signal ? AbortSignal.any([signal as AbortSignal, hard.signal]) : hard.signal;
    const id = seq++;
    pending.set(id, { method, since: now() });
    try {
      return await prev(method, payload, sig as typeof signal);
    } catch (err) {
      if (!hard.signal.aborted && !(signal as AbortSignal | undefined)?.aborted) {
        if (err instanceof HttpError) {
          const inner = err.error instanceof Error ? err.error.message : "";
          failure = inner ? `${err.message} (${inner})` : err.message;
        } else if (err instanceof GrammyError && err.error_code >= 500) {
          failure = describeError(err);
        }
      }
      throw err;
    } finally {
      pending.delete(id);
    }
  });

  return {
    cut() {
      clearTimeout(timer);
      hard.abort();
    },
    cutAfter(ms) {
      if (hard.signal.aborted || timer) return;
      timer = setTimeout(() => hard.abort(), ms);
    },
    lastFailure: () => failure,
    oldestPending() {
      let oldest: { method: string; since: number } | undefined;
      for (const p of pending.values()) if (!oldest || p.since < oldest.since) oldest = p;
      return oldest;
    },
  };
}
