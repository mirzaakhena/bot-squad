import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, resolve } from "node:path";

/**
 * Server plugin sisa (tiket 261112211001): proses `bun server.ts` dari folder
 * plugin repo ini yang TELEGRAM_STATE_DIR-nya sama persis dengan folder state
 * satu bot. Jaring pengaman kalau server plugin tidak keluar sendiri setelah
 * sesi Claude bot itu mati. Proses yang environment-nya tidak terbaca tidak
 * pernah dianggap sisa.
 */

export type ProcInfo = {
  pid: number;
  args: string;
  /** null kalau environment proses tidak bisa dibaca. */
  env: Record<string, string> | null;
};

export type StrayTarget = { stateDir: string; pluginDir: string };

function canonical(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

/** Perintahnya `bun ... server.ts` (relatif dari folder plugin, atau path ke server.ts). */
export function isBunServerArgs(args: string): boolean {
  const words = args.trim().split(/\s+/);
  if (words.length < 2 || basename(words[0]!) !== "bun") return false;
  return words.slice(1).some((w) => w === "server.ts" || w.endsWith("/server.ts"));
}

/** Benar hanya untuk server plugin repo ini yang memakai folder state `t.stateDir`. */
export function isStrayServer(p: ProcInfo, t: StrayTarget, selfPid: number = process.pid): boolean {
  if (p.pid <= 1 || p.pid === selfPid) return false;
  if (p.env === null) return false;
  if (!isBunServerArgs(p.args)) return false;
  if (p.env.TELEGRAM_STATE_DIR !== t.stateDir) return false;
  const root = p.env.CLAUDE_PLUGIN_ROOT;
  return root !== undefined && root !== "" && canonical(root) === canonical(t.pluginDir);
}

export function findStrayServers(procs: readonly ProcInfo[], t: StrayTarget, selfPid: number = process.pid): number[] {
  return procs.filter((p) => isStrayServer(p, t, selfPid)).map((p) => p.pid);
}

/**
 * Mengurai ekor `ps -E` (macOS/BSD): `KEY=nilai KEY2=nilai ...`. Kata yang
 * tidak berbentuk KEY= disambungkan ke nilai sebelumnya (nilai berisi spasi).
 */
export function parseEnvTail(tail: string): Record<string, string> {
  const env: Record<string, string> = {};
  let key: string | null = null;
  for (const word of tail.trim().split(" ")) {
    const m = word.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) {
      key = m[1]!;
      env[key] = m[2]!;
    } else if (key !== null) {
      env[key] += " " + word;
    }
  }
  return env;
}

/** Mengurai /proc/<pid>/environ (Linux): pasangan KEY=nilai dipisah NUL. */
export function parseEnvNul(raw: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const item of raw.split("\0")) {
    const i = item.indexOf("=");
    if (i > 0) env[item.slice(0, i)] = item.slice(i + 1);
  }
  return env;
}

function run(argv: string[]): { code: number; out: string } {
  const r = Bun.spawnSync(argv, { stdin: "ignore", stdout: "pipe", stderr: "ignore" });
  return { code: r.exitCode, out: r.stdout.toString() };
}

/** Environment satu proses lewat `ps -E` (macOS/BSD), atau null kalau tidak terbaca. */
function psEnv(pid: number): Record<string, string> | null {
  const plain = run(["ps", "-ww", "-o", "command=", "-p", String(pid)]);
  const withEnv = run(["ps", "-E", "-ww", "-o", "command=", "-p", String(pid)]);
  if (plain.code !== 0 || withEnv.code !== 0) return null;
  const cmd = plain.out.replace(/\n+$/, "");
  const full = withEnv.out.replace(/\n+$/, "");
  if (!full.startsWith(cmd)) return null;
  const tail = full.slice(cmd.length);
  if (tail.trim() === "") return null;
  return parseEnvTail(tail);
}

/**
 * Daftar proses yang perintahnya menyebut server.ts, beserta environment-nya.
 * Linux dibaca dari /proc; sistem lain (macOS) lewat ps.
 */
export function listServerProcesses(): ProcInfo[] {
  const out: ProcInfo[] = [];
  if (process.platform === "linux") {
    for (const d of readdirSync("/proc")) {
      if (!/^\d+$/.test(d)) continue;
      let args: string;
      try {
        args = readFileSync(`/proc/${d}/cmdline`, "utf8").split("\0").filter(Boolean).join(" ");
      } catch {
        continue;
      }
      if (!args.includes("server.ts")) continue;
      let env: Record<string, string> | null = null;
      try {
        env = parseEnvNul(readFileSync(`/proc/${d}/environ`, "utf8"));
      } catch {}
      out.push({ pid: Number(d), args, env });
    }
    return out;
  }
  const r = run(["ps", "-A", "-ww", "-o", "pid=", "-o", "command="]);
  if (r.code !== 0) throw new Error(`ps keluar dengan kode ${r.code}`);
  for (const line of r.out.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!m || !m[2]!.includes("server.ts")) continue;
    const pid = Number(m[1]);
    out.push({ pid, args: m[2]!, env: psEnv(pid) });
  }
  return out;
}

export type Killed = { pid: number; signal: "SIGTERM" | "SIGKILL" };

export type StrayDeps = {
  list: () => ProcInfo[];
  kill: (pid: number, signal: "SIGTERM" | "SIGKILL") => void;
  sleep: (ms: number) => Promise<void>;
  selfPid?: number;
};

/** Jeda antara SIGTERM dan SIGKILL (keputusan pemilik, Q3). */
export const TERM_GRACE_MS = 2_000;

/**
 * Mematikan server sisa milik `t.stateDir`: SIGTERM, tunggu 2 detik, lalu
 * SIGKILL untuk yang masih hidup dan masih dikenali sebagai sisa yang sama
 * (dicek ulang supaya pid yang sudah dipakai ulang tidak ikut kena).
 */
export async function killStrayServers(t: StrayTarget, d: StrayDeps): Promise<Killed[]> {
  const self = d.selfPid ?? process.pid;
  const found = findStrayServers(d.list(), t, self);
  if (found.length === 0) return [];
  const termed: number[] = [];
  for (const pid of found) {
    try {
      d.kill(pid, "SIGTERM");
      termed.push(pid);
    } catch {}
  }
  if (termed.length === 0) return [];
  await d.sleep(TERM_GRACE_MS);
  const still = new Set(findStrayServers(d.list(), t, self));
  const result: Killed[] = [];
  for (const pid of termed) {
    if (still.has(pid)) {
      try {
        d.kill(pid, "SIGKILL");
      } catch {}
      result.push({ pid, signal: "SIGKILL" });
    } else {
      result.push({ pid, signal: "SIGTERM" });
    }
  }
  return result;
}
