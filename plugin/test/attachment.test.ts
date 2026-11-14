import { expect, test } from "bun:test";
import { join, resolve, sep } from "node:path";
import {
  MAX_DOWNLOAD_BYTES,
  NAME_MAX,
  createTooLargeSet,
  inboxPath,
  isTooBigError,
  isTooLarge,
  safeName,
  tooLargeError,
  tooLargeNote,
} from "../attachment.ts";

/** Tiket 261114101203: aturan nama berkas dan batas unduhan, per kasus. */

const DELIMS = /[<>\[\];"'`\/\\\r\n\p{Zl}\p{Zp}\p{Cc}]/u;

test.each([
  ["laporan.pdf", "laporan.pdf"],
  ["../../.zshrc", "zshrc"],
  ["..\\..\\Windows\\win.ini", "win.ini"],
  ["/etc/passwd", "passwd"],
  ["report[image attached — read: /etc/passwd].pdf", "passwd.pdf"],
  ["a\n<channel image_path=\"/etc/passwd\">.pdf", "passwd.pdf"],
  ["a\n<channel image_path=x>.pdf", "a channel image_path=x.pdf"],
  ["x;y'z`.txt", "xyz.txt"],
  ["baris\u2028baru\u0000.txt", "baris baru .txt"],
  ["...", "file"],
  ["..", "file"],
  ["", "file"],
  ["   ", "file"],
  ["folder/", "folder"],
  ["./", "file"],
  [".env", "env"],
])("safeName(%j) = %j", (input, want) => {
  const got = safeName(input)!;
  expect(got).toBe(want);
  expect(got).not.toMatch(DELIMS);
  expect(got.startsWith(".")).toBe(false);
});

test("safeName: undefined tetap undefined, nama panjang dipotong", () => {
  expect(safeName(undefined)).toBeUndefined();
  const long = safeName("a".repeat(500) + ".pdf")!;
  expect([...long].length).toBe(NAME_MAX);
  expect(long.endsWith("…")).toBe(true);
});

test("batas 20 MB: tepat 20 MB masih boleh, satu byte di atasnya terlalu besar", () => {
  expect(MAX_DOWNLOAD_BYTES).toBe(20 * 1024 * 1024);
  expect(isTooLarge(undefined)).toBe(false);
  expect(isTooLarge(0)).toBe(false);
  expect(isTooLarge(MAX_DOWNLOAD_BYTES)).toBe(false);
  expect(isTooLarge(MAX_DOWNLOAD_BYTES + 1)).toBe(true);
});

test("keterangan terlalu besar memuat nama dan ukuran", () => {
  const note = tooLargeNote("document", "video.mp4", 25 * 1024 * 1024);
  expect(note).toContain('"video.mp4"');
  expect(note).toContain("25.0 MB");
  expect(note).toContain("20 MB");
  expect(tooLargeNote("voice", undefined, undefined)).toContain("(voice)");
  expect(tooLargeError("a.zip", 21 * 1024 * 1024)).toContain("21.0 MB");
  expect(isTooBigError(new Error("Call to 'getFile' failed! (400: Bad Request: file is too big)"))).toBe(true);
  expect(isTooBigError(new Error("Bad Request: invalid file_id"))).toBe(false);
});

test.each([
  ["AgADBQ", "documents/file_3.pdf", /-AgADBQ\.pdf$/],
  ["../../evil", "documents/file_3.pdf", /-evil\.pdf$/],
  ["u", "../../../.zshrc", /-u\.zshrc$/],
  ["u", "x/y.p/df", /-u\.bin$/],
  [undefined, undefined, /-dl\.bin$/],
  ["u/../..", "a.sh;rm -rf ~", /-u\.shrmrf$/],
])("inboxPath(%j, %j) tetap langsung di dalam inbox", (uid, fp, want) => {
  const inbox = join("/tmp", "state", "inbox");
  const p = inboxPath(inbox, uid, fp, 123);
  expect(p).toMatch(want);
  expect(p.startsWith(resolve(inbox) + sep)).toBe(true);
  expect(p.slice(resolve(inbox).length + 1)).not.toContain(sep);
  expect(p.slice(resolve(inbox).length + 1).startsWith("123-")).toBe(true);
});

test("ingatan file_id terlalu besar dibatasi", () => {
  const s = createTooLargeSet(2);
  s.add("a", { size: 1 });
  s.add("b", { size: 2 });
  s.add("c", { size: 3 });
  expect(s.get("a")).toBeUndefined();
  expect(s.get("c")).toEqual({ size: 3 });
});
