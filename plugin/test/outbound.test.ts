import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Tiket 261114101205: konversi Markdown -> MarkdownV2, karakter khusus,
 * pemotongan balasan panjang, dan penjahitan blok kode. Butuh paket
 * telegramify-markdown, jadi dilewati tanpa plugin/node_modules.
 */
const PLUGIN = resolve(import.meta.dir, "..");
const hasDeps = existsSync(join(PLUGIN, "node_modules", "telegramify-markdown"));
if (!hasDeps) console.warn(`outbound.test: dilewati, paket plugin belum dipasang (bun install --cwd ${PLUGIN})`);
const mod = hasDeps ? await import("../outbound.ts") : null;
const o = mod!;

const RESERVED = "_*[]()~`>#+-=|{}.!";

/** Hitung fence ``` di awal baris; jumlah genap = setiap blok tertutup. */
const fenceLines = (s: string) => s.split("\n").filter((l) => /^ {0,3}`{3,}/.test(l));

test.skipIf(!hasDeps)("Markdown biasa menjadi format Telegram", () => {
  expect(o.toMarkdownV2("**tebal**")).toBe("*tebal*");
  expect(o.toMarkdownV2("*miring*")).toBe("_miring_");
  expect(o.toMarkdownV2("_miring_")).toBe("_miring_");
  expect(o.toMarkdownV2("`kode`")).toBe("`kode`");
  expect(o.toMarkdownV2("~~coret~~")).toBe("~coret~");
  expect(o.toMarkdownV2("```ts\nconst a = 1;\n```")).toBe("```\nconst a = 1;\n```");
  expect(o.toMarkdownV2("[tautan](https://example.com/a?b=1)")).toBe("[tautan](https://example.com/a?b=1)");
  expect(o.toMarkdownV2("- satu\n- dua")).toBe("•   satu\n•   dua");
  expect(o.toMarkdownV2("1. a\n2. b")).toBe("1\\.  a\n2\\.  b");
  expect(o.toMarkdownV2("# Judul")).toBe("*Judul*");
  expect(o.toMarkdownV2("")).toBe("");
});

test.skipIf(!hasDeps)("setiap karakter khusus MarkdownV2 di teks biasa di-escape", () => {
  for (const c of RESERVED + "\\") {
    expect(o.toMarkdownV2(`a ${c} b`)).toBe(`a \\${c} b`);
    expect(o.toMarkdownV2(`x${c}y`)).toBe(`x\\${c}y`);
  }
  // Kalimat biasa yang dulu membuat Telegram menolak seluruh pesan.
  expect(o.toMarkdownV2("Selesai! Versi 1.2 (beta) - lihat a+b=c.")).toBe(
    "Selesai\\! Versi 1\\.2 \\(beta\\) \\- lihat a\\+b\\=c\\.",
  );
  // Tabel dan garis tidak punya padanan: di-escape, tidak dibuang.
  expect(o.toMarkdownV2("| a | b |\n|---|---|\n| 1 | 2 |")).toBe("\\| a \\| b \\|\n\\| \\- \\| \\- \\|\n\\| 1 \\| 2 \\|");
  expect(o.toMarkdownV2("---")).toBe("\\-\\-\\-");
  // Di dalam kode, hanya ` dan \ yang di-escape; titik dan kurung tidak.
  expect(o.toMarkdownV2("`a.b(c)`")).toBe("`a.b(c)`");
  expect(o.toMarkdownV2("```\nx.y(z) \\ !\n```")).toBe("```\nx.y(z) \\\\ !\n```");
  // Di URL tautan, ) di-escape.
  expect(o.toMarkdownV2("[a.b](https://x.y/a_(b))")).toBe("[a\\.b](https://x.y/a_\\(b\\))");
});

test.skipIf(!hasDeps)("format: bawaan markdown, text dan markdownv2 tetap seperti dulu", () => {
  expect(o.normalizeFormat(undefined)).toBe("markdown");
  expect(o.normalizeFormat("apa")).toBe("markdown");
  expect(o.normalizeFormat("text")).toBe("text");
  expect(o.normalizeFormat("markdownv2")).toBe("markdownv2");
  expect(o.planReply("**a**.", "markdown", 4096, "length")).toEqual([{ text: "*a*\\.", parseMode: "MarkdownV2", plain: "**a**." }]);
  expect(o.planReply("**a**.", "text", 4096, "length")).toEqual([{ text: "**a**.", parseMode: undefined, plain: "**a**." }]);
  expect(o.planReply("*a*\\.", "markdownv2", 4096, "length")).toEqual([{ text: "*a*\\.", parseMode: "MarkdownV2", plain: "*a*\\." }]);
  expect(o.planEdit("**a**.", "markdown")).toEqual({ text: "*a*\\.", parseMode: "MarkdownV2", plain: "**a**." });
  expect(o.planEdit("**a**.", "text").parseMode).toBeUndefined();
  // Edit yang hasil konversinya melewati batas dikirim sebagai teks biasa.
  const big = ".".repeat(3000);
  expect(o.planEdit(big, "markdown")).toEqual({ text: big, parseMode: undefined, plain: big });
});

test.skipIf(!hasDeps)("balasan panjang: tiap potongan dalam batas, blok kode dijahit ulang dengan bahasanya", () => {
  const code = Array.from({ length: 400 }, (_, i) => `const v${i} = f(${i}); // baris ${i}.`).join("\n");
  const text = `Penjelasan **awal**.\n\n\`\`\`ts\n${code}\n\`\`\`\n\nPenutup: *selesai*!`;
  // Tanpa chunkMode (seperti access.json tulisan master-bot).
  const parts = o.planReply(text, "markdown", 4096);
  expect(parts.length).toBeGreaterThan(2);
  for (const p of parts) {
    expect(p.text.length).toBeLessThanOrEqual(4096);
    expect(p.parseMode).toBe("MarkdownV2");
    // Setiap potongan punya fence yang seimbang: tidak ada blok yang
    // "menelan" potongan berikutnya.
    expect(fenceLines(p.text).length % 2).toBe(0);
    expect(fenceLines(p.plain).length % 2).toBe(0);
  }
  // Potongan tengah dibuka lagi dengan bahasa yang sama (di teks asli).
  for (const p of parts.slice(1, -1)) expect(p.plain.startsWith("```ts\n")).toBe(true);
  expect(parts[0]!.text.startsWith("Penjelasan *awal*\\.")).toBe(true);
  expect(parts.at(-1)!.text.endsWith("Penutup: _selesai_\\!")).toBe(true);
  // Baris kode tidak terbelah, tidak hilang, tidak ganda.
  const lines = parts.flatMap((p) => p.plain.split("\n")).filter((l) => l.startsWith("const v"));
  expect(lines).toEqual(code.split("\n"));
});

test.skipIf(!hasDeps)("balasan panjang tanpa kode dan dengan banyak karakter khusus tetap dalam batas", () => {
  const text = Array.from({ length: 300 }, (_, i) => `Langkah ${i}. (a+b)=c! [x] {y} #z |w| ~v~.`).join("\n");
  for (const mode of [undefined, "newline", "length"] as const) {
    const parts = o.planReply(text, "markdown", 4096, mode);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.text.length).toBeLessThanOrEqual(4096);
    expect(parts.map((p) => p.plain).join(mode === "length" ? "" : "\n")).toBe(text);
  }
  // Format lain tanpa chunkMode tetap dipotong per panjang seperti dulu.
  const plain = o.planReply(text, "text", 4096);
  expect(plain[0]!.text.length).toBe(4096);
  expect(plain.map((p) => p.text).join("")).toBe(text);
});

test.skipIf(!hasDeps)("textChunkLimit kecil tetap dihormati, juga saat escape melebihi batas", () => {
  const text = "!".repeat(250);
  const parts = o.planReply(text, "markdown", 100);
  for (const p of parts) expect(p.text.length).toBeLessThanOrEqual(100);
  expect(parts.map((p) => p.plain).join("")).toBe(text);
  // Escape tepat 2x: potongan 50 karakter mentah menjadi 100 dan masih muat.
  expect(parts.every((p) => p.parseMode === "MarkdownV2")).toBe(true);
  // Tabel membengkak > 2x: potongan itu dikirim sebagai teks biasa.
  const table = "| a | b |\n|---|---|\n".repeat(20);
  const tp = o.planReply(table, "markdown", 100);
  for (const p of tp) expect(p.text.length).toBeLessThanOrEqual(100);
  expect(tp.some((p) => p.parseMode === undefined)).toBe(true);
});

test.skipIf(!hasDeps)("balanceFences: fence panjang, fence berlapis, dan potongan tanpa fence", () => {
  expect(o.balanceFences(["a", "b"])).toEqual(["a", "b"]);
  expect(o.balanceFences(["```py\nx", "y\n```\nz"])).toEqual(["```py\nx\n```", "```py\ny\n```\nz"]);
  // ```` hanya ditutup oleh ```` atau lebih; ``` di dalamnya isi biasa.
  expect(o.balanceFences(["````md\n```js", "a\n```", "````\nok"])).toEqual([
    "````md\n```js\n````",
    "````md\na\n```\n````",
    "````md\n````\nok",
  ]);
});

test.skipIf(!hasDeps)("format ditolak Telegram: dikirim ulang sebagai teks biasa, error lain tidak", async () => {
  const calls: Array<[string, string | undefined]> = [];
  const reject = Object.assign(new Error("Call to 'sendMessage' failed! (400: Bad Request: can't parse entities: Can't find end of Bold entity at offset 3)"), {
    error_code: 400,
    description: "Bad Request: can't parse entities: Can't find end of Bold entity at offset 3",
  });
  const part = { text: "*a\\.", parseMode: "MarkdownV2" as const, plain: "**a." };
  let fell = 0;
  const r = await o.sendWithFallback(part, async (t, pm) => {
    calls.push([t, pm]);
    if (pm) throw reject;
    return 7;
  }, () => fell++);
  expect(r).toBe(7);
  expect(calls).toEqual([["*a\\.", "MarkdownV2"], ["**a.", undefined]]);
  expect(fell).toBe(1);

  for (const desc of ["Bad Request: Character '-' is reserved and must be escaped with the preceding '\\'", "Bad Request: can't find end of the entity starting at byte offset 5"]) {
    expect(o.isFormatRejection({ error_code: 400, description: desc })).toBe(true);
  }
  expect(o.isFormatRejection({ error_code: 400, description: "Bad Request: message to be replied not found" })).toBe(false);
  expect(o.isFormatRejection({ error_code: 403, description: "Forbidden: bot was blocked by the user" })).toBe(false);
  expect(o.isFormatRejection(new Error("network"))).toBe(false);

  const other = Object.assign(new Error("x"), { error_code: 403, description: "Forbidden" });
  const seen: Array<string | undefined> = [];
  await expect(o.sendWithFallback(part, async (_t, pm) => { seen.push(pm); throw other; })).rejects.toBe(other);
  expect(seen).toEqual(["MarkdownV2"]);
});
