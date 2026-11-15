/**
 * bot-squad: /context dan tangkapan statusline (tiket 261112230304).
 *
 * Mengikuti /context di mirza-bots (cc-plugin/src/engine/context/): Claude
 * Code mem-PUSH payload statusline ke perintah `statusLine`-nya, jadi satu-
 * satunya cara memperolehnya adalah menjadi perintah itu (bridge,
 * bot-squad-statusline.ts), menyimpannya ke <state>/status.json, lalu
 * meneruskan payload yang sama ke statusline pendahulu. /context dijawab dari
 * berkas itu saja, tanpa mengirim apa pun ke sesi Claude.
 *
 * Bedanya dengan mirza-bots: bot-squad tidak pernah menulis berkas
 * pengaturan Claude. Master menentukan pendahulu saat start
 * (master/src/statusline.ts), menulis rantainya ke <state>/chained-statusline
 * dan hasilnya ke <state>/statusline.json, lalu memasang bridge lewat
 * `--settings` sesi itu saja.
 *
 * Hanya boleh mengimpor `node:` dan context-render.ts (nol-import): bridge
 * memuat berkas ini setiap kali baris status digambar ulang.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { renderContext, type CapturedStatus } from './context-render.ts'

/** Tangkapan statusline terakhir (ditulis bridge). */
export const STATUS_FILE = 'status.json'
/** Statusline pendahulu yang diteruskan bridge (ditulis master saat start). */
export const CHAIN_FILE = 'chained-statusline'
/** Hasil pemasangan bridge untuk sesi ini (ditulis master saat start). */
export const INSTALL_FILE = 'statusline.json'
/** Nama berkas bridge di folder plugin; juga dipakai untuk mengenali bridge sendiri. */
export const BRIDGE_FILE = 'bot-squad-statusline.ts'

export type InstallRecord =
  | { kind: 'installed'; chained: string | null; at_ms: number }
  | { kind: 'refused' | 'rolled-back'; reason: string; at_ms: number }

// ---------------------------------------------------------------------------
// Berkas tangkapan (dari mirza-bots status-file.ts, ditambah 0600 dan
// pembedaan "belum ada" dengan "tidak terbaca").

export function writeCapturedStatus(path: string, payload: unknown, nowMs: number): void {
  mkdirSync(dirname(path), { recursive: true })
  const body = JSON.stringify({ captured_at_ms: nowMs, payload })
  // Atomik: pembaca bisa datang di tengah penulisan.
  const tmp = `${path}.tmp.${process.pid}`
  try {
    writeFileSync(tmp, body, { mode: 0o600 })
    renameSync(tmp, path)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
}

export type ReadStatus =
  | { kind: 'ok'; status: CapturedStatus }
  | { kind: 'missing' }
  | { kind: 'unreadable'; reason: string }

export function readCapturedStatus(path: string): ReadStatus {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' }
    return { kind: 'unreadable', reason: errMsg(err) }
  }
  try {
    const parsed = JSON.parse(text)
    if (
      typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) ||
      typeof parsed.captured_at_ms !== 'number' ||
      typeof parsed.payload !== 'object' || parsed.payload === null || Array.isArray(parsed.payload)
    ) {
      return { kind: 'unreadable', reason: 'isinya bukan tangkapan statusline' }
    }
    return { kind: 'ok', status: parsed as CapturedStatus }
  } catch {
    return { kind: 'unreadable', reason: 'JSON rusak' }
  }
}

export function readInstallRecord(stateDir: string): InstallRecord | null {
  try {
    const r = JSON.parse(readFileSync(join(stateDir, INSTALL_FILE), 'utf8'))
    if (r?.kind === 'installed') return r as InstallRecord
    if ((r?.kind === 'refused' || r?.kind === 'rolled-back') && typeof r.reason === 'string') return r as InstallRecord
    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Pemanggilan statusline pendahulu (disalin dari mirza-bots invoke.ts).

export type ChainInvocation = { command: string; shell: boolean }

function splitFirstToken(s: string): { first: string; rest: string } {
  const quoted = s.match(/^"([^"]*)"\s*(.*)$/)
  if (quoted) return { first: quoted[1] ?? '', rest: (quoted[2] ?? '').trim() }
  const bare = s.match(/^(\S+)\s*(.*)$/)
  return { first: bare?.[1] ?? '', rest: (bare?.[2] ?? '').trim() }
}

/** Perintah yang token pertamanya berakhiran .sh dijalankan lewat bash; selain itu apa adanya. */
export function planChainInvocation(command: string): ChainInvocation {
  const trimmed = command.trim()
  const { first, rest } = splitFirstToken(trimmed)
  if (/\.sh$/i.test(first)) {
    const args = rest ? ` ${rest}` : ''
    return { command: `bash "${first}"${args}`, shell: true }
  }
  return { command: trimmed, shell: true }
}

// ---------------------------------------------------------------------------
// Menunggu berkas tangkapan (disalin dari mirza-bots wait.ts).

export type WaitOptions = {
  attempts: number
  delayMs: number
  sleep: (ms: number) => Promise<void>
}

export async function waitForCapture<T>(read: () => T | null, opts: WaitOptions): Promise<T | null> {
  const attempts = Math.max(1, opts.attempts)
  for (let i = 0; i < attempts; i++) {
    let got: T | null = null
    try {
      got = read()
    } catch {
      got = null
    }
    if (got !== null) return got
    if (i < attempts - 1) await opts.sleep(opts.delayMs)
  }
  return null
}

// ---------------------------------------------------------------------------
// Siapa yang boleh memakai /context (keputusan pemilik Q1): hanya pengirim di
// allowFrom bot ini, di chat pribadi. Selain itu tidak dibalas sama sekali,
// apa pun dmPolicy-nya.

export function contextAllowed(
  chatType: string | undefined,
  senderId: number | string | undefined,
  access: { dmPolicy: string; allowFrom: string[] },
): boolean {
  if (chatType !== 'private') return false
  if (senderId === undefined || senderId === null) return false
  if (access.dmPolicy === 'disabled') return false
  return access.allowFrom.includes(String(senderId))
}

// ---------------------------------------------------------------------------
// Jawaban /context. Alur dan teks mengikuti replyLocalContext di mirza-bots.

export const WAIT_ATTEMPTS = 12
export const WAIT_DELAY_MS = 1500

export type ContextDeps = {
  stateDir: string
  now: () => number
  sleep: (ms: number) => Promise<void>
  send: (text: string) => Promise<void>
  attempts?: number
  delayMs?: number
}

export function refusedText(reason: string): string {
  return (
    `Jembatan statusline TIDAK dipasang, dan itu disengaja.\n\n` +
    `Alasan: ${reason}\n\n` +
    `Statusline Claude Code milikmu dibiarkan apa adanya. Kalau harus memilih, ` +
    `/context yang mengalah -- bukan sebaliknya.`
  )
}

export const NOT_INSTALLED_TEXT =
  `Jembatan statusline belum terpasang di sesi bot ini, jadi belum ada data /context.\n\n` +
  `Sesi ini dinyalakan sebelum /context ada, atau tidak lewat master-bot/start-bot.sh. ` +
  `Nyalakan ulang bot, lalu kirim /context lagi.`

export const WAITING_TEXT = `⏳ Menunggu data statusline...`

export const STILL_EMPTY_TEXT =
  `Masih belum ada data statusline sesudah menunggu.\n\n` +
  `Jembatannya terpasang, tapi Claude Code belum menggambar baris status. ` +
  `Pakai bot ini sebentar, lalu kirim /context lagi.`

export function unreadableText(path: string, reason: string): string {
  return (
    `Data statusline tidak bisa dibaca, jadi tidak ada angka yang ditampilkan.\n\n` +
    `Berkas: ${path}\nAlasan: ${reason}\n\n` +
    `Berkas ini ditulis ulang setiap kali Claude Code menggambar baris status. ` +
    `Pakai bot ini sebentar, lalu kirim /context lagi.`
  )
}

/** Menjawab /context dari berkas lokal bot ini saja. Tidak pernah melempar karena isi berkas. */
export async function answerContext(d: ContextDeps): Promise<void> {
  const record = readInstallRecord(d.stateDir)
  if (record && record.kind !== 'installed') {
    await d.send(refusedText(record.reason))
    return
  }

  const path = join(d.stateDir, STATUS_FILE)
  const first = readCapturedStatus(path)
  if (first.kind === 'ok') {
    await d.send(renderContext(first.status, d.now()))
    return
  }
  if (first.kind === 'unreadable') {
    await d.send(unreadableText(path, first.reason))
    return
  }
  if (record === null) {
    await d.send(NOT_INSTALLED_TEXT)
    return
  }

  // Bridge terpasang tetapi Claude Code belum menggambar baris status. Beri
  // tahu dulu, lalu tunggu kejadiannya (berkasnya muncul), bukan durasi tebakan.
  await d.send(WAITING_TEXT)
  let last: ReadStatus = first
  const got = await waitForCapture(() => {
    last = readCapturedStatus(path)
    return last.kind === 'ok' ? last.status : null
  }, { attempts: d.attempts ?? WAIT_ATTEMPTS, delayMs: d.delayMs ?? WAIT_DELAY_MS, sleep: d.sleep })
  if (got !== null) {
    await d.send(renderContext(got, d.now()))
    return
  }
  const end = last as ReadStatus
  if (end.kind === 'unreadable') await d.send(unreadableText(path, end.reason))
  else await d.send(STILL_EMPTY_TEXT)
}

function errMsg(err: unknown): string {
  const e = err as NodeJS.ErrnoException
  return e?.code ? e.code : err instanceof Error ? err.message : String(err)
}
