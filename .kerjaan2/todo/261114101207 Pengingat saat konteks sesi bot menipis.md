---
type: feature
priority: low
lane: standard
labels: []
blocked_by: []
related: []
touches: [plugin/server.ts, plugin/context.ts, plugin/reminder.ts, plugin/test/reminder.test.ts, CLAUDE.md]
created: 2026-11-14 10:12
---

## Background

Sesi Claude sebuah bot bisa berjalan lama sampai konteksnya hampir penuh, dan pemilik baru tahu kalau mengetik /context. Di mirza-bots, saat konteks terpakai melewati ambang (400 ribu token di sana), pesan berikutnya ke AI membawa pengingat. Pengingat itu hanya menempel pada pesan yang memang datang (tidak membangunkan AI sendiri) dan hilang sendiri begitu kondisinya tidak lagi terpenuhi. Keputusan memulai percakapan baru tetap milik pemilik. Data konteks sudah tersedia di bot-squad lewat statusline yang dipakai /context.

Rujukan: /Users/mirza/Workspace/mirza-bots/README.md (bagian "Fitur") dan kode cc-plugin di folder yang sama. Dipilih pemilik pada 2026-11-14 dari daftar fitur mirza-bots yang tidak mengetik ke sesi Claude.

## Request

Saat konteks sesi bot menipis, Claude diingatkan supaya bisa memberi tahu pemilik, tanpa pemilik harus memeriksa sendiri.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot-01..03 pemilik sedang berjalan).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`). Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot-01..03 pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] Saat pemakaian konteks sesi bot melewati ambang (di atas 400 ribu token terpakai ATAU di atas 50% jendela konteks, mana yang lebih dulu), pesan pemilik berikutnya yang diteruskan ke Claude membawa pengingat bahwa konteks menipis beserta angkanya.
- [ ] Pengingat tidak pernah dikirim sendirian (tidak membangunkan Claude tanpa pesan pemilik) dan berhenti sendiri setelah konteks kembali di bawah ambang (misalnya setelah percakapan baru).
- [ ] Kalau data konteks tidak tersedia atau basi, tidak ada pengingat yang salah.
- [ ] Ada tes otomatis untuk di atas ambang, di bawah ambang, dan data tidak ada.
- [ ] CLAUDE.md menjelaskan perilaku dan ambangnya.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Ambang pengingat konteks menipis? Payload statusline memberi total_input_tokens dan context_window_size; jendelanya bisa 200 ribu atau 1 juta token. A (rekomendasi): menyala kalau terpakai di atas 400 ribu token ATAU di atas 50% jendela, mana yang lebih dulu, sehingga tetap berguna di jendela 200 ribu (menyala di 100 ribu). B: persis mirza-bots, di atas 400 ribu token saja (tidak pernah menyala di jendela 200 ribu). C: persentase saja, di atas 50% jendela (sebutkan kalau mau angka lain, mis. 70%).
  → 400rb token atau 50% (Recommended) — opsi A: menyala di atas 400 ribu token terpakai ATAU di atas 50% jendela, mana yang lebih dulu. (owner, 2026-11-14)

## Assumptions
- A1 [unseen] Pengingat di meta (atribut context_reminder: imbauan plus angka terpakai/jendela), bukan di content, supaya tidak bisa dipalsukan dengan mengetik; instruksi MCP menjelaskannya dan bahwa keputusan percakapan baru milik pemilik. Hanya pada pesan yang diteruskan (bukan perintah plugin, izin, atau dibuang). Angka dari status.json lewat readCapturedStatus (plugin/context.ts) saat pesan masuk. Tidak tersedia = berkas tidak ada, rusak, atau angka null; umur berkas bukan syarat (sesi menganggur tidak berubah konteksnya; status.json lama dihapus saat start).
  Why: README mirza-bots bagian Pengingat mesin; CLAUDE.md bagian /context.
  If wrong: Pindahkan ke content atau tambah batas umur.

## Decisions
- Lane standard: menambah teks pengingat ke notifikasi masuk, hanya membaca status.json. Perubahannya kecil di titik notifikasi, jadi jalan berdampingan dengan tiket lain tanpa blocked_by.
- Uji plugin dilewati diam-diam tanpa plugin/node_modules: worker wajib menjalankan 'bun install --cwd plugin' di worktree sebelum k2 test dan memastikan tes barunya benar-benar jalan (bukan skip). Logika baru diletakkan di modul sendiri (seperti plugin/context.ts, plugin/log.ts) dengan kait sekecil mungkin di server.ts supaya merge antar tiket ringan.
- 2026-11-14 moved to todo: Pertanyaan dijawab pemilik; urutan dan blocked_by disetujui
