import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Penjaga tiket 261113194401: setiap server di tes harus menyebut hostname.
 * Tanpa itu Bun mendengar semua alamat, dan macOS bisa memberi port yang sama
 * dengan pendengar 127.0.0.1 milik proses lain, sehingga permintaan tes sampai
 * ke proses itu dan tes gagal acak. Lihat komentar di fake-telegram.ts.
 */
test("setiap Bun.serve/Bun.listen di tes menyebut hostname", () => {
  const root = join(import.meta.dir, "..", "..");
  const missing: string[] = [];
  for (const dir of ["master/test", "plugin/test"]) {
    for (const f of readdirSync(join(root, dir)).filter((n) => n.endsWith(".ts"))) {
      const src = readFileSync(join(root, dir, f), "utf8");
      for (const m of src.matchAll(/Bun\.(serve|listen)\(\{/g)) {
        // Isi objek opsi sampai kunci "port" pertama (bukan di komentar):
        // hostname harus ada di situ.
        const head = src.slice(m.index!, m.index! + 600);
        const portAt = head.search(/(\{ |\n\s*)port[,:]/);
        const opts = portAt >= 0 ? head.slice(0, portAt + 20) : head;
        if (!/hostname:/.test(opts)) missing.push(`${dir}/${f}:${src.slice(0, m.index!).split("\n").length}`);
      }
    }
  }
  expect(missing).toEqual([]);
});
