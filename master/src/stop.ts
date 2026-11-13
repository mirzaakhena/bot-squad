import { NAME_RULE } from "./register.ts";
import { botPaths, isAlive, PLUGIN_DIR, readPid, realTmux, type Tmux } from "./launch.ts";
import { redact } from "./log.ts";
import { abortableSleep } from "./retry.ts";
import { findStrayServers, killStrayServers, listServerProcesses, type Killed, type ProcInfo } from "./strays.ts";

/**
 * Mematikan satu bot (tiket 261112225302, A1): tmux kill-session, tunggu
 * server plugin bot itu keluar sendiri, lalu sisanya dimatikan lewat
 * killStrayServers (SIGTERM, 2 detik, SIGKILL). Hanya proses yang dikenali
 * strays.ts untuk folder state bot ini (bun server.ts + CLAUDE_PLUGIN_ROOT
 * repo ini + TELEGRAM_STATE_DIR yang sama persis) yang boleh dimatikan.
 * Bukti mati datang dari daftar proses, bukan dari hilangnya bot.pid.
 */

/** Batas tunggu server plugin keluar sendiri setelah sesi dimatikan. */
export const EXIT_TIMEOUT_MS = 10_000;
export const STOP_POLL_MS = 250;
/** Tunggu singkat setelah SIGKILL sebelum memeriksa ulang. */
export const AFTER_KILL_MS = 1_000;

export type StopDeps = {
  dataDir: string;
  pluginDir: string;
  tmux: Pick<Tmux, "hasSession" | "killSession">;
  isAlive: (pid: number) => boolean;
  list: () => ProcInfo[];
  kill: (pid: number, signal: "SIGTERM" | "SIGKILL") => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  log?: (message: string) => void;
  selfPid?: number;
  exitTimeoutMs?: number;
  pollMs?: number;
};

export type StopResult = {
  /** Sesi tmux atau server plugin bot ini hidup saat perintah dimulai. */
  wasRunning: boolean;
  /** Server plugin yang terpaksa dimatikan setelah batas tunggu. */
  killed: Killed[];
  /** Sesi tmux masih hidup setelah semua langkah. */
  sessionLeft: boolean;
  /** Server plugin bot ini yang masih hidup setelah SIGKILL. */
  pidsLeft: number[];
  /**
   * bot.pid masih ada dan pid-nya hidup, tetapi proses itu tidak dikenali
   * sebagai server plugin bot ini (environment tak terbaca atau pid dipakai
   * ulang). Tidak pernah dimatikan; hanya dilaporkan.
   */
  unrecognizedPid?: number;
  /** tmux atau daftar proses tidak bisa diperiksa. */
  error?: string;
};

export const isClean = (r: StopResult) => !r.sessionLeft && r.pidsLeft.length === 0 && r.error === undefined;

function short(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return redact(msg.split("\n")[0]!.slice(0, 200), []);
}

/** Tidak pernah melempar error: kegagalan memeriksa menjadi `error`. */
export async function stopBot(name: string, deps: StopDeps): Promise<StopResult> {
  const result: StopResult = { wasRunning: false, killed: [], sessionLeft: false, pidsLeft: [] };
  if (!NAME_RULE.test(name)) return { ...result, error: "nama bot tidak sesuai aturan" };
  const { state, pidFile } = botPaths(deps.dataDir, name);
  const target = { stateDir: state, pluginDir: deps.pluginDir };
  const self = deps.selfPid ?? process.pid;
  const servers = () => findStrayServers(deps.list(), target, self);
  const pollMs = deps.pollMs ?? STOP_POLL_MS;

  try {
    const hadSession = await deps.tmux.hasSession(name);
    const filePid = readPid(pidFile);
    result.wasRunning = hadSession || servers().length > 0 || (filePid !== null && deps.isAlive(filePid));

    if (hadSession) {
      try {
        await deps.tmux.killSession(name);
        deps.log?.(`sesi tmux '${name}' dimatikan (/stop)`);
      } catch (err) {
        deps.log?.(`sesi tmux '${name}' gagal dimatikan: ${short(err)}`);
      }
    }

    // Server plugin biasanya keluar sendiri sekitar 2 detik setelah sesinya mati.
    const deadline = deps.now() + (deps.exitTimeoutMs ?? EXIT_TIMEOUT_MS);
    let left = servers();
    while (left.length > 0 && deps.now() < deadline) {
      await deps.sleep(pollMs);
      left = servers();
    }

    if (left.length > 0) {
      result.killed = await killStrayServers(target, { list: deps.list, kill: deps.kill, sleep: deps.sleep, selfPid: self });
      for (const k of result.killed) deps.log?.(`server plugin '${name}' dimatikan paksa: pid ${k.pid} (${k.signal})`);
      left = servers();
      if (left.length > 0) {
        await deps.sleep(AFTER_KILL_MS);
        left = servers();
      }
    }

    result.pidsLeft = left;
    result.sessionLeft = await deps.tmux.hasSession(name);
    const stillPid = readPid(pidFile);
    if (stillPid !== null && !left.includes(stillPid) && deps.isAlive(stillPid)) result.unrecognizedPid = stillPid;
  } catch (err) {
    result.error = short(err);
    deps.log?.(`/stop '${name}' tidak bisa memeriksa tmux atau proses: ${result.error}`);
  }
  return result;
}

/** Dependensi asli untuk mematikan bot di mesin ini. */
export function realStopDeps(dataDir: string, log?: (message: string) => void): StopDeps {
  return {
    dataDir,
    pluginDir: PLUGIN_DIR,
    tmux: realTmux,
    isAlive,
    list: listServerProcesses,
    kill: (pid, sig) => process.kill(pid, sig),
    sleep: (ms) => abortableSleep(ms),
    now: () => Date.now(),
    ...(log ? { log } : {}),
  };
}
