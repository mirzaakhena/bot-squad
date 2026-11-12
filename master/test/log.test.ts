import { expect, test } from "bun:test";
import { createLogger, redact } from "../src/log.ts";
import { parseEnv } from "../src/config.ts";

test("redact menghapus token yang diketahui dan yang berbentuk token", () => {
  const known = "short:secret";
  const shaped = "5550001112:AAH-abcdefghijklmnopqrstuvwxyz0123456";
  const out = redact(`a ${known} b ${shaped} c`, [known]);
  expect(out).not.toContain(known);
  expect(out).not.toContain(shaped);
});

test("logger selalu menyensor", () => {
  const lines: string[] = [];
  const log = createLogger(["rahasia:xyz"], (l) => lines.push(l));
  log("url /botrahasia:xyz/getMe");
  expect(lines[0]).not.toContain("rahasia:xyz");
});

test("parseEnv", () => {
  expect(parseEnv("# c\nA=1\nexport B = 'dua'\nC=\"tiga\"\n\nrusak\n")).toEqual({ A: "1", B: "dua", C: "tiga" });
});
