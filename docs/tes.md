# Tes: cara menjalankan dan jebakan

Cara menjalankan tes, aturan server tiruan, dan langkah kalau tes gagal acak.

Rincian ini dipindahkan apa adanya dari `CLAUDE.md` (tiket 261115094501). Rujukan `lihat "<judul bagian>"` yang tidak ada di berkas ini menunjuk ke bagian di berkas `docs/` lain; cari lewat daftar isi di `CLAUDE.md`.

- Tes: `bun test` dari root repo. Tes memakai server Telegram tiruan (`master/test/fake-telegram.ts`), jadi tidak butuh token asli. Tes plugin dilewati kalau `plugin/node_modules` belum dipasang (`bun install --cwd plugin`).
- **Server tiruan di tes wajib `hostname: "127.0.0.1"`** (tiket 261113194401). `Bun.serve({ port: 0 })` tanpa hostname mendengar semua alamat (`*:port`), dan macOS mau memberinya port yang sama dengan pendengar `127.0.0.1:port` milik proses lain (sesi Claude Code, Chrome, juga `Bun.listen` 127.0.0.1 di tes lain). Port dibagi berurutan untuk seluruh mesin, jadi kejadiannya acak dan lebih sering saat dua kumpulan tes jalan bersamaan. Permintaan ke `127.0.0.1:port` lalu sampai ke proses itu: grammY melapor `Network request ... failed!` dengan `JSON Parse error: Unexpected EOF` atau `Failed to parse JSON`, 404 `not found`, atau koneksi diputus. `[::1]` tidak sampai ke server 127.0.0.1; pakai server `::1` sendiri seperti `api-root.test.ts`.
- Kalau tes gagal acak lagi: simpan keluaran lengkap (`bun test 2>&1 | tee <berkas di luar repo>`), ulangi dengan dua kumpulan tes bersamaan dari dua salinan repo (HOME, BOT_SQUAD_HOME, dan TMUX_TMPDIR sementara), lalu saat gagal cek siapa yang mendengar port itu: `lsof -nP -iTCP:<port> -sTCP:LISTEN`. Pesan error grammY tanpa angka status berarti jawabannya bukan dari server tiruan.

## Token tiruan dan secret scanning GitHub (tiket 261115101501)

- Repo publik, dan secret scanning GitHub menandai token tiruan di tes (`<angka>:<huruf acak>`) sebagai "Telegram Bot Token" lewat email. Tes memang butuh bentuk itu (pendaftaran bot, penyensoran token), jadi bentuknya tidak diubah.
- `.github/secret_scanning.yml` berisi `paths-ignore` untuk `master/test/**` dan `plugin/test/**` saja. Format dan pola path dari dokumentasi GitHub: https://docs.github.com/en/code-security/how-tos/secure-your-secrets/customize-leak-detection/exclude-folders-and-files (maks. 1000 entri, berkas di atas 1 MB diabaikan seluruhnya).
- **Akibatnya GitHub tidak mendeteksi token asli yang tidak sengaja masuk ke folder tes. Folder `master/test/` dan `plugin/test/` hanya boleh berisi token tiruan; jangan pernah menaruh token asli di sana, juga sementara.**
