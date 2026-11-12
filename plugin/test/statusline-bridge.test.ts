import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Tiket 261112230304: bridge statusline dijalankan seperti Claude Code
 * menjalankannya (perintah shell, payload JSON di stdin).
 */
const BRIDGE = resolve(import.meta.dir, "..", "bot-squad-statusline.ts");
const PAYLOAD = JSON.stringify({ session_id: "abc", context_window: { used_percentage: 4 }, rate_limits: { seven_day: { used_percentage: 31, resets_at: 1 } } });

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { chmodSync(d, 0o700); } catch {}
    rmSync(d, { recursive: true, force: true });
  }
});
function tmp() {
  const d = mkdtempSync(join(tmpdir(), "bot-squad-bridge-"));
  dirs.push(d);
  return d;
}

function run(stateDir: string, input = PAYLOAD) {
  const r = Bun.spawnSync(["bun", BRIDGE, stateDir], { stdin: Buffer.from(input), stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

/** Statusline pendahulu tiruan: menyimpan stdin-nya dan mencetak satu baris. */
function predecessor(dir: string, kind: "sh" | "cmd") {
  const seen = join(dir, "seen.json");
  if (kind === "sh") {
    const script = join(dir, "pendahulu.sh");
    writeFileSync(script, `cat > '${seen}'\nprintf 'PENDAHULU %s' "$1"\n`);
    // Tanpa bit eksekusi: bridge harus menjalankannya lewat bash.
    return { command: `${script} arg1`, seen, expected: "PENDAHULU arg1" };
  }
  return { command: `cat > '${seen}'; printf 'BARIS\\n\\033[32mwarna\\033[0m'`, seen, expected: "BARIS\n\x1b[32mwarna\x1b[0m" };
}

test("menangkap ke status.json (0600) dan meneruskan payload yang sama ke pendahulu; keluarannya utuh", () => {
  for (const kind of ["sh", "cmd"] as const) {
    const state = tmp();
    const p = predecessor(state, kind);
    writeFileSync(join(state, "chained-statusline"), p.command + "\n");
    const r = run(state);
    expect(r.code).toBe(0);
    expect(r.out).toBe(p.expected);
    expect(readFileSync(p.seen, "utf8")).toBe(PAYLOAD);
    const cap = JSON.parse(readFileSync(join(state, "status.json"), "utf8"));
    expect(cap.payload).toEqual(JSON.parse(PAYLOAD));
    expect(typeof cap.captured_at_ms).toBe("number");
    expect(statSync(join(state, "status.json")).mode & 0o777).toBe(0o600);
  }
});

test("tanpa pendahulu: menangkap dan tidak mencetak apa pun", () => {
  const state = tmp();
  writeFileSync(join(state, "chained-statusline"), "");
  const r = run(state);
  expect(r).toEqual({ code: 0, out: "", err: "" });
  expect(existsSync(join(state, "status.json"))).toBe(true);
});

test("gagal menangkap tidak mematikan baris status", () => {
  // (a) payload bukan JSON, (b) status.json berupa folder, (c) folder state tak bisa ditulis.
  const cases: Array<[string, (state: string) => void, string]> = [
    ["payload rusak", () => {}, "{bukan json"],
    ["status.json folder", (s) => mkdirSync(join(s, "status.json")), PAYLOAD],
    ["state read-only", (s) => chmodSync(s, 0o500), PAYLOAD],
  ];
  for (const [name, prep, input] of cases) {
    const state = tmp();
    const p = predecessor(state, "cmd");
    // Pendahulu menulis ke folder lain supaya tetap jalan di state read-only.
    const other = tmp();
    const seen = join(other, "seen.json");
    writeFileSync(join(state, "chained-statusline"), p.command.replace(p.seen, seen));
    prep(state);
    const r = run(state, input);
    expect({ name, code: r.code, out: r.out }).toEqual({ name, code: 0, out: p.expected });
    expect(readFileSync(seen, "utf8")).toBe(input);
    expect(readdirNoTmp(state)).toBe(true);
  }
});

test("folder state yang tidak ada: tidak menulis apa pun, tidak error", () => {
  const base = tmp();
  const r = run(join(base, "tidak-ada"));
  expect(r).toEqual({ code: 0, out: "", err: "" });
  expect(existsSync(join(base, "tidak-ada"))).toBe(false);
});

test("pendahulu yang menggantung dihentikan setelah ~5 detik", () => {
  const state = tmp();
  writeFileSync(join(state, "chained-statusline"), "printf AWAL; sleep 30");
  const t0 = Date.now();
  const r = run(state);
  expect(Date.now() - t0).toBeLessThan(10_000);
  expect(r.code).toBe(0);
  expect(r.out).toBe("AWAL");
}, 20_000);

function readdirNoTmp(state: string): boolean {
  // Berkas sementara dari tulis atomik yang gagal tidak boleh tertinggal.
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  try {
    return !readdirSync(state).some((f) => f.includes(".tmp."));
  } catch {
    return true;
  }
}
