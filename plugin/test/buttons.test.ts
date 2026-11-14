import { describe, expect, test } from "bun:test";
import {
  CHOICE_PREFIX,
  MANUAL_FALLBACK_BUTTON,
  MAX_CALLBACK_DATA_BYTES,
  buildTappedEdit,
  checkButtons,
  choiceContent,
  findTappedLabel,
  parseButtons,
  parseChoiceData,
  toInlineKeyboard,
  withManualFallback,
} from "../buttons.ts";

/** Tiket 261114101206: aturan tombol pilihan, tanpa Telegram. */

const M = MANUAL_FALLBACK_BUTTON;

describe("parseButtons", () => {
  test("baris, data bawaan = label, tombol tunggal jadi satu baris", () => {
    expect(parseButtons([[{ text: "1" }, { text: "2", data: "dua" }], { text: "Lain" }])).toEqual([
      [{ text: "1", data: "1" }, { text: "2", data: "dua" }],
      [{ text: "Lain", data: "Lain" }],
    ]);
    expect(parseButtons(undefined)).toEqual([]);
    expect(parseButtons([])).toEqual([]);
  });
  test("bentuk salah ditolak dengan cara memperbaiki", () => {
    expect(() => parseButtons("1,2")).toThrow(/array of rows/);
    expect(() => parseButtons([[{ text: "" }]])).toThrow(/non-empty "text"/);
    expect(() => parseButtons([[{ data: "x" }]])).toThrow(/non-empty "text"/);
    expect(() => parseButtons([[{ text: "a", data: 5 }]])).toThrow(/"data" must be a string/);
  });
});

describe("withManualFallback", () => {
  test("label persis mirza-bots", () => {
    expect(M.text).toBe("✏️ Explain manually");
  });
  test("ditempel sebagai baris terakhir; keyboard kosong tetap kosong", () => {
    expect(withManualFallback([])).toEqual([]);
    const rows = parseButtons([[{ text: "1" }, { text: "2" }]]);
    expect(withManualFallback(rows)).toEqual([...rows, [M]]);
  });
  test("tidak muncul dua kali kalau Claude menulisnya sendiri (label atau data), dan selalu terakhir", () => {
    const byLabel = parseButtons([[{ text: "1" }, { text: "✏️ Explain manually" }], [{ text: "2" }]]);
    expect(withManualFallback(byLabel)).toEqual([[{ text: "1", data: "1" }], [{ text: "2", data: "2" }], [M]]);
    const byData = parseButtons([[{ text: "Tulis sendiri", data: M.data }], [{ text: "1" }]]);
    expect(withManualFallback(byData)).toEqual([[{ text: "1", data: "1" }], [M]]);
    const twice = parseButtons([[{ text: M.text }], [{ text: M.text }]]);
    expect(withManualFallback(twice)).toEqual([[M]]);
    expect(withManualFallback(withManualFallback(byLabel))).toEqual(withManualFallback(byLabel));
  });
});

describe("checkButtons", () => {
  const ok = (text: string, raw: unknown) => checkButtons(text, withManualFallback(parseButtons(raw)));

  test("tombol bernomor dengan daftar bernomor lolos ('1.' dan '1)', boleh menjorok)", () => {
    expect(ok("Pilih:\n1. Lanjut\n2. Batal", [[{ text: "1" }, { text: "2" }]])).toBeNull();
    expect(ok("Pilih:\n  1) Lanjut\n  2) Batal", [[{ text: "1" }, { text: "2" }]])).toBeNull();
  });
  test("tombol bernomor tanpa daftar yang cocok ditolak, menyebut nomor yang hilang", () => {
    const e1 = ok("Pilih satu", [[{ text: "1" }, { text: "2" }]]);
    expect(e1).toContain("numbered_buttons_without_list");
    expect(e1).toContain('"1", "2" have none');
    const e2 = ok("1. Lanjut\nopsi 2 lebih aman", [[{ text: "1" }, { text: "2" }]]);
    expect(e2).toContain('"2" has none');
    expect(e2).toContain("Nothing was sent");
  });
  test("satu tombol angka atau label kata tidak kena aturan nomor", () => {
    expect(ok("Jumlah?", [[{ text: "3" }]])).toBeNull();
    expect(ok("Lanjut?", [[{ text: "✅ Ya" }, { text: "❌ Tidak" }]])).toBeNull();
  });
  test("batas byte callback_data: tepat di batas lolos, lebih satu byte ditolak; emoji dihitung 4 byte", () => {
    const room = MAX_CALLBACK_DATA_BYTES - CHOICE_PREFIX.length;
    expect(ok("x", [[{ text: "a", data: "d".repeat(room) }]])).toBeNull();
    const err = ok("x", [[{ text: "a", data: "d".repeat(room + 1) }]]);
    expect(err).toContain("callback_data_too_long");
    expect(err).toContain(`${room + 1} bytes`);
    // 16 emoji = 16 karakter tampilan tetapi 64 byte.
    expect(ok("x", [[{ text: "a", data: "😀".repeat(16) }]])).toContain("callback_data_too_long");
    // Label panjang tanpa data: label dipakai sebagai data, jadi ditolak dengan saran data pendek.
    expect(ok("x", [[{ text: "L".repeat(70) }]])).toContain('short "data"');
    // Tombol jawab-sendiri bawaan selalu muat.
    expect(Buffer.byteLength(CHOICE_PREFIX + M.data)).toBeLessThanOrEqual(MAX_CALLBACK_DATA_BYTES);
  });
  test("terlalu banyak tombol per baris atau per pesan ditolak", () => {
    expect(ok("x", [Array.from({ length: 9 }, (_, i) => ({ text: `b${i}` }))])).toContain("too_many_buttons_in_row");
    expect(ok("x", Array.from({ length: 100 }, (_, i) => [{ text: `b${i}` }]))).toContain("too_many_buttons");
  });
});

describe("keyboard dan ketukan", () => {
  test("callback_data diberi awalan dan dikembalikan", () => {
    const kb = toInlineKeyboard(withManualFallback(parseButtons([[{ text: "1" }]])));
    expect(kb.inline_keyboard).toEqual([[{ text: "1", callback_data: "c:1" }], [{ text: M.text, callback_data: `c:${M.data}` }]]);
    expect(parseChoiceData("c:1")).toBe("1");
    expect(parseChoiceData("perm:allow:abcde")).toBeNull();
    expect(findTappedLabel(kb, "c:1")).toBe("1");
    expect(findTappedLabel(kb, "c:9")).toBeNull();
    expect(findTappedLabel(undefined, "c:1")).toBeNull();
  });
  test("isi untuk Claude: data, atau pemberitahuan jawab-sendiri", () => {
    expect(choiceContent("dua")).toBe("dua");
    const manual = choiceContent(M.data);
    expect(manual).toContain("type their own answer");
    expect(manual).toContain("do not pick an option");
  });
  test("pesan ditandai pilihan; entity dipertahankan; terlalu panjang -> null", () => {
    const ents = [{ type: "bold", offset: 0, length: 5 }];
    expect(buildTappedEdit({ text: "Pilih\n1. A", entities: ents }, "1")).toEqual({ text: "Pilih\n1. A\n\n→ 1", entities: ents });
    expect(buildTappedEdit({ text: "Pilih" }, "1")).toEqual({ text: "Pilih\n\n→ 1" });
    expect(buildTappedEdit(undefined, "1")).toBeNull();
    expect(buildTappedEdit({ text: "x".repeat(4094) }, "1")).toBeNull();
  });
});
