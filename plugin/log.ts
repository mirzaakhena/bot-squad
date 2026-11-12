/**
 * bot-squad: always-on diagnostic log at <STATE_DIR>/plugin.log (ticket
 * 261112230301). One line per event: `<local ISO time> <event> key=value ...`.
 * Never contains message text or the bot token. Writing is best-effort: any
 * failure is swallowed (reported once on stderr) so it can never stop the
 * server or delay delivery to Claude.
 */

import { appendFileSync, chmodSync, renameSync, statSync } from 'fs'

export const LOG_MAX_BYTES = 1_000_000
const REDACTED = '<token>'
/** Anything shaped like a Telegram bot token: <digits>:<30+ chars>. */
const TOKEN_SHAPE = /\d{5,}(:|%3A)[A-Za-z0-9_-]{30,}/gi

/** Removes the known token (raw and URL-encoded) and anything token-shaped. */
export function redact(text: string, secrets: readonly string[]): string {
  let out = text
  for (const s of secrets) {
    if (!s) continue
    out = out.split(s).join(REDACTED)
    const enc = encodeURIComponent(s)
    if (enc !== s) out = out.split(enc).join(REDACTED)
  }
  return out.replace(TOKEN_SHAPE, REDACTED)
}

/** Local time in ISO 8601 with milliseconds and UTC offset, e.g. 2026-11-12T23:10:00.123+07:00. */
export function isoLocal(ms: number): string {
  const d = new Date(ms)
  const p = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0')
  const off = -d.getTimezoneOffset()
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}` +
    `${off >= 0 ? '+' : '-'}${p(Math.trunc(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`
  )
}

/** Seconds between two epoch-ms values, 3 decimals, e.g. "1.234s". */
export function secs(fromMs: number, toMs: number): string {
  return `${((toMs - fromMs) / 1000).toFixed(3)}s`
}

/** One-line description of an error, including grammY's wrapped cause. */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  let s = `${err.name}: ${err.message}`
  const inner = (err as { error?: unknown }).error
  if (inner instanceof Error) {
    s += ` <- ${inner.name}: ${inner.message}`
    const code = (inner as { code?: unknown }).code
    if (typeof code === 'string' && !inner.message.includes(code)) s += ` (${code})`
  } else if (inner != null && typeof inner !== 'object') {
    s += ` <- ${String(inner)}`
  }
  return s
}

/** Quotes a free-text value so a line stays one line and parseable. */
export const q = (v: string): string => JSON.stringify(v)

export type PluginLog = (event: string, fields?: Record<string, string | number | undefined>) => void

export function createPluginLog(opts: {
  file: string
  secrets: readonly string[]
  maxBytes?: number
  now?: () => number
  onFirstError?: (err: unknown) => void
}): PluginLog {
  const max = opts.maxBytes ?? LOG_MAX_BYTES
  const now = opts.now ?? Date.now
  let size: number | undefined
  let warned = false
  let chmodDone = false

  return (event, fields = {}) => {
    try {
      let line = `${isoLocal(now())} ${event}`
      for (const [k, v] of Object.entries(fields)) if (v !== undefined) line += ` ${k}=${v}`
      line = redact(line.replace(/[\r\n]+/g, ' '), opts.secrets) + '\n'
      const bytes = Buffer.byteLength(line)

      if (size === undefined) {
        try { size = statSync(opts.file).size } catch { size = 0 }
      }
      if (size > 0 && size + bytes > max) {
        // One generation only: an old plugin.log.1 is overwritten.
        renameSync(opts.file, `${opts.file}.1`)
        size = 0
        chmodDone = false
      }
      appendFileSync(opts.file, line, { mode: 0o600 })
      size += bytes
      if (!chmodDone) {
        // mode only applies on create; tighten a file that pre-existed.
        chmodSync(opts.file, 0o600)
        chmodDone = true
      }
    } catch (err) {
      size = undefined // re-stat next time; the disk may recover
      if (!warned) {
        warned = true
        try { opts.onFirstError?.(err) } catch {}
      }
    }
  }
}
