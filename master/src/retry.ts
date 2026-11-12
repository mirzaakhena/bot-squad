import { GrammyError, HttpError } from "grammy";
import { describeError } from "./log.ts";

export type RetryPolicy = {
  /** Jeda pertama; default 2 detik. Jeda berikutnya dua kali lipat. */
  firstDelayMs?: number;
  /** Batas satu jeda; default 60 detik. */
  maxDelayMs?: number;
  /** Batas jumlah semua jeda; default 10 menit. */
  totalMs?: number;
  /** Diganti di tes. Harus selesai lebih awal kalau signal dibatalkan. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

export type SendOutcome =
  | { ok: true; attempts: number }
  | { ok: false; attempts: number; reason: string; cause: "permanent" | "exhausted" | "stopped" };

/**
 * Apakah error dari Telegram bersifat sementara. Jaringan (HttpError) dan 5xx
 * dicoba ulang; 429 dicoba ulang setelah retry_after. Error lain tidak.
 */
export function transientDelayMs(err: unknown): { retry: false } | { retry: true; waitMs?: number } {
  if (err instanceof HttpError) return { retry: true };
  if (err instanceof GrammyError) {
    if (err.error_code === 429) {
      const after = err.parameters?.retry_after;
      return { retry: true, waitMs: typeof after === "number" && after > 0 ? after * 1000 : undefined };
    }
    if (err.error_code >= 500) return { retry: true };
  }
  return { retry: false };
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

/**
 * Menjalankan send sampai berhasil, dengan jeda 2, 4, 8, ... detik (maks. 60
 * per jeda, total sekitar 10 menit) untuk gangguan sementara. Berhenti seketika
 * kalau signal dibatalkan. Tidak pernah melempar.
 */
export async function sendWithRetry(
  send: (signal?: AbortSignal) => Promise<unknown>,
  signal: AbortSignal | undefined,
  policy: RetryPolicy = {},
  onRetry?: (info: { attempt: number; waitMs: number; reason: string }) => void,
): Promise<SendOutcome> {
  const first = policy.firstDelayMs ?? 2_000;
  const max = policy.maxDelayMs ?? 60_000;
  const total = policy.totalMs ?? 600_000;
  const sleep = policy.sleep ?? abortableSleep;
  const stopped = (attempts: number): SendOutcome => ({
    ok: false,
    attempts,
    reason: "master-bot berhenti sebelum laporan terkirim",
    cause: "stopped",
  });

  let waited = 0;
  let backoff = first;
  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) return stopped(attempt - 1);
    try {
      await send(signal);
      return { ok: true, attempts: attempt };
    } catch (err) {
      if (signal?.aborted) return stopped(attempt);
      const reason = describeError(err);
      const t = transientDelayMs(err);
      if (!t.retry) return { ok: false, attempts: attempt, reason, cause: "permanent" };
      const waitMs = t.waitMs ?? backoff;
      // Jeda terakhir boleh melewati batas total sedikit (paling banyak satu jeda
      // maksimum), supaya urutan 2, 4, ..., 60 genap sekitar 10 menit.
      if (waited >= total || waited + waitMs > total + max) {
        return {
          ok: false,
          attempts: attempt,
          reason: `${reason} (menyerah setelah ${attempt} percobaan dalam ${Math.round(waited / 1000)} detik)`,
          cause: "exhausted",
        };
      }
      onRetry?.({ attempt, waitMs, reason });
      await sleep(waitMs, signal);
      waited += waitMs;
      backoff = Math.min(backoff * 2, max);
    }
  }
}
