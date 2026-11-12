import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bridgeCommand,
  isOurBridge,
  prepareStatusline,
  resolveChain,
  shQuote,
  type StatuslineOptions,
} from "../src/statusline.ts";
import { claudeArgv, PLUGIN_DIR } from "../src/launch.ts";

/** Tiket 261112230304: pemasangan bridge statusline beserta pagarnya. Semua di folder sementara. */

let root: string;
let o: StatuslineOptions;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "bot-squad-statusline-"));
  const workspace = join(root, "workspace");
  const stateDir = join(root, "state");
  mkdirSync(workspace);
  mkdirSync(stateDir);
  o = { workspace, stateDir, pluginDir: "/repo/plugin", userSettings: join(root, "home", ".claude", "settings.json"), now: () => 1234 };
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const sl = (command: string) => ({ statusLine: { type: "command", command } });
function put(path: string, value: unknown) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
}
const local = () => join(o.workspace, ".claude", "settings.local.json");
const project = () => join(o.workspace, ".claude", "settings.json");
const chain = () => readFileSync(join(o.stateDir, "chained-statusline"), "utf8");
const record = () => JSON.parse(readFileSync(join(o.stateDir, "statusline.json"), "utf8"));

describe("resolveChain mengikuti presedens local > project > user", () => {
  test("hanya user", () => expect(resolveChain([undefined, undefined, sl("u").statusLine])).toEqual({ kind: "found", command: "u" }));
  test("project menang atas user", () =>
    expect(resolveChain([undefined, sl("p").statusLine, sl("u").statusLine])).toEqual({ kind: "found", command: "p" }));
  test("local menang atas project dan user", () =>
    expect(resolveChain([sl("l").statusLine, sl("p").statusLine, sl("u").statusLine])).toEqual({ kind: "found", command: "l" }));
  test("perintah kosong berarti tidak ada, lapisan berikutnya dipakai", () =>
    expect(resolveChain([sl("  ").statusLine, { type: "command" }, sl("u").statusLine])).toEqual({ kind: "found", command: "u" }));
  test("tidak ada sama sekali", () => expect(resolveChain([undefined, null, "x"])).toEqual({ kind: "none" }));
  test("bridge sendiri dikenali", () =>
    expect(resolveChain([sl("bun '/lain/plugin/bot-squad-statusline.ts' '/s'").statusLine]).kind).toBe("ours"));
});

test("isOurBridge tidak menganggap statusline lain milik kita", () => {
  expect(isOurBridge(bridgeCommand("/a/plugin", "/s"))).toBe(true);
  expect(isOurBridge("/Users/x/claude-context/bin/rekam-statusline.sh /Users/x/.claude/statusline-progress.sh")).toBe(false);
  expect(isOurBridge("bun run /x/cc-plugin/bin/statusline-bridge.ts")).toBe(false);
});

test("shQuote aman untuk spasi dan kutip tunggal", () => {
  const p = "/tmp/a b/it's";
  const r = Bun.spawnSync(["sh", "-c", `printf %s ${shQuote(p)}`]);
  expect(r.stdout.toString()).toBe(p);
});

describe("prepareStatusline", () => {
  test("pendahulu user: rantai ditulis 0600, bridge dipasang, hasil dicatat", () => {
    put(o.userSettings, { ...sl("/h/rekam-statusline.sh /h/progress.sh"), model: "x" });
    const r = prepareStatusline(o);
    expect(r).toEqual({ kind: "installed", command: bridgeCommand("/repo/plugin", o.stateDir), chained: "/h/rekam-statusline.sh /h/progress.sh" });
    expect(chain()).toBe("/h/rekam-statusline.sh /h/progress.sh");
    expect(statSync(join(o.stateDir, "chained-statusline")).mode & 0o777).toBe(0o600);
    expect(record()).toEqual({ kind: "installed", chained: "/h/rekam-statusline.sh /h/progress.sh", at_ms: 1234 });
  });

  test("pendahulu dari project dan local workspace", () => {
    put(o.userSettings, sl("u"));
    put(project(), sl("p"));
    expect(prepareStatusline(o)).toMatchObject({ kind: "installed", chained: "p" });
    put(local(), sl("l"));
    expect(prepareStatusline(o)).toMatchObject({ kind: "installed", chained: "l" });
    expect(chain()).toBe("l");
  });

  test("tanpa pendahulu di mana pun (berkas tidak ada): bridge tanpa rantai", () => {
    expect(prepareStatusline(o)).toMatchObject({ kind: "installed", chained: null });
    expect(chain()).toBe("");
  });

  test("rantai lama diganti, bukan ditambah", () => {
    writeFileSync(join(o.stateDir, "chained-statusline"), "lama");
    expect(prepareStatusline(o)).toMatchObject({ kind: "installed", chained: null });
    expect(chain()).toBe("");
  });

  for (const [name, path, content] of [
    ["user JSON rusak", () => o.userSettings, "{rusak"],
    ["project JSON rusak", () => project(), "{rusak"],
    ["local JSON rusak", () => local(), "[1,2]"],
    ["user bukan objek", () => o.userSettings, "null"],
  ] as const) {
    test(`tidak pasti (${name}): tidak memasang, rantai lama tidak dipakai, alasan dicatat`, () => {
      put(o.userSettings, sl("u"));
      writeFileSync(join(o.stateDir, "chained-statusline"), "u");
      put(path(), content);
      const r = prepareStatusline(o);
      expect(r.kind).toBe("refused");
      expect(record()).toMatchObject({ kind: "refused" });
      expect(record().reason).toContain(path());
      expect(claudeArgv("/p", null).join(" ")).not.toContain("statusLine");
    });
  }

  test("tidak pasti (berkas tak bisa dibaca karena izin)", () => {
    if (process.getuid?.() === 0) return;
    put(o.userSettings, sl("u"));
    chmodSync(o.userSettings, 0o000);
    expect(prepareStatusline(o).kind).toBe("refused");
  });

  test("yang efektif sudah bridge kita: tidak memasang (tidak merantai ke diri sendiri)", () => {
    put(project(), sl(bridgeCommand("/repo/plugin", o.stateDir)));
    const r = prepareStatusline(o);
    expect(r.kind).toBe("refused");
    expect(record().reason).toContain("bridge bot-squad");
  });

  test("rantai gagal ditulis: rollback, tidak memasang", () => {
    put(o.userSettings, sl("u"));
    const r = prepareStatusline({ ...o, writeFile: () => { throw new Error("disk penuh"); } });
    expect(r).toEqual({ kind: "rolled-back", reason: "gagal menyimpan rantai statusline: disk penuh" });
    expect(existsSync(join(o.stateDir, "chained-statusline"))).toBe(false);
    expect(record()).toMatchObject({ kind: "rolled-back" });
  });

  test("rantai terbaca ulang berbeda: rollback", () => {
    put(o.userSettings, sl("u"));
    const r = prepareStatusline({ ...o, writeFile: (p) => writeFileSync(p, "lain") });
    expect(r.kind).toBe("rolled-back");
    expect(existsSync(join(o.stateDir, "chained-statusline"))).toBe(false);
  });

  test("status.json sesi lama dihapus", () => {
    writeFileSync(join(o.stateDir, "status.json"), "{}");
    prepareStatusline(o);
    expect(existsSync(join(o.stateDir, "status.json"))).toBe(false);
  });

  test("tidak ada berkas pengaturan Claude yang ditulis atau diubah", () => {
    put(o.userSettings, sl("u"));
    put(project(), { other: 1 });
    const before = [o.userSettings, project()].map((p) => [readFileSync(p, "utf8"), statSync(p).mtimeMs]);
    const listing = () => [readdirSync(join(o.workspace, ".claude")).sort(), readdirSync(join(root, "home", ".claude")).sort()];
    const l0 = listing();
    for (let i = 0; i < 3; i++) prepareStatusline(o);
    expect([o.userSettings, project()].map((p) => [readFileSync(p, "utf8"), statSync(p).mtimeMs])).toEqual(before);
    expect(listing()).toEqual(l0);
    expect(existsSync(local())).toBe(false);
  });
});

describe("claudeArgv", () => {
  test("tanpa statusline sama dengan sebelumnya", () => {
    expect(claudeArgv("/p")[4]).toBe('{"skipDangerousModePermissionPrompt":true}');
  });
  test("dengan statusline: dipasang lewat --settings", () => {
    const cmd = bridgeCommand(PLUGIN_DIR, "/s t/state");
    const argv = claudeArgv("/p", cmd);
    expect(argv[3]).toBe("--settings");
    expect(JSON.parse(argv[4]!)).toEqual({ skipDangerousModePermissionPrompt: true, statusLine: { type: "command", command: cmd } });
    expect(existsSync(join(PLUGIN_DIR, "bot-squad-statusline.ts"))).toBe(true);
  });
});
