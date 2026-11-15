---
type: task
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-15 09:45
---

## Background

`CLAUDE.md` di root repo sudah 472 baris dan sekitar 92 KB (sekitar 12 ribu kata), dan dimuat ke konteks setiap sesi dan setiap agen (worker, reviewer, planner). Ia membengkak karena hampir setiap tiket punya butir "CLAUDE.md diperbarui", sehingga setiap worker menambahkan satu bagian berisi perilaku rinci fiturnya. Isinya sekarang campuran pedoman kerja, dokumentasi rinci per perintah master-bot (sekitar 21 KB), dokumentasi per fitur chat bot (sekitar 27 KB), hasil spike dan riset, rancangan bot berkirim pesan ke bot lain yang sudah dibatalkan pemilik (sekitar 13 KB), dan daftar status yang menduplikasi papan tiket.

Satu tiket biasanya hanya butuh sebagian kecil dari semua itu.

Keputusan pemilik (2026-11-15): `CLAUDE.md` diringkas, rinciannya dipindah ke folder `docs/` dan dibaca hanya saat perlu.

## Request

`CLAUDE.md` menjadi pedoman singkat yang berlaku untuk semua pekerjaan di repo ini, dan rincian per perintah, per fitur, serta hasil riset pindah ke berkas di `docs/` tanpa kehilangan isi.

Arahan dari pemilik:
- Yang tetap di `CLAUDE.md`: terminologi, cara kerja, keputusan yang sudah disepakati, struktur repo, data runtime, cara menjalankan master-bot dan tes, jebakan penting yang berlaku lintas pekerjaan (misalnya satu poller per token, cara memuat plugin sebagai channel, hilangnya `bot.pid` bukan bukti server mati, server tiruan di tes wajib `127.0.0.1`, data asli pemilik di `~/.bot-squad` tidak boleh disentuh saat uji), concern yang masih terbuka, prinsip perintah terpilih, dan cara bekerja dengan pemilik.
- Rincian dipindah **apa adanya** (boleh dirapikan judul dan urutannya, tidak ditulis ulang atau diringkas) ke beberapa berkas di `docs/` yang dikelompokkan per topik, misalnya master-bot, menyalakan bot, fitur chat bot, log bot, kuota.
- `CLAUDE.md` memuat daftar isi `docs/`: satu baris per berkas, isinya apa, dan kapan wajib dibaca ("baca sebelum mengubah ...").
- `CLAUDE.md` memuat aturan untuk pekerjaan berikutnya: rincian fitur ditulis di `docs/`, bukan sebagai bagian baru di `CLAUDE.md`; butir tiket "CLAUDE.md diperbarui" berarti berkas `docs/` yang sesuai diperbarui, dan `CLAUDE.md` hanya diubah kalau pedoman umumnya berubah.
- Dihapus, tidak dipindah: bagian rancangan bot berkirim pesan ke bot lain (dibatalkan pemilik 2026-11-15; cukup satu atau dua kalimat di `CLAUDE.md` bahwa itu dibatalkan dan dilakukan manual lewat session-id, dengan nomor tiket 261112230309 dan 261113230601 untuk yang ingin melihat riwayatnya), dan bagian "Status saat ini" (digantikan papan tiket).

Tiket ini hanya mengubah dokumen. Tidak ada kode, tes, atau perilaku yang berubah, dan tidak ada yang perlu dijalankan terhadap `~/.bot-squad`, tmux, atau Telegram.

## Done when

- [x] `CLAUDE.md` paling banyak 150 baris dan 15 KB, dan tetap memuat semua butir "yang tetap di CLAUDE.md" di atas.
- [x] Setiap bagian rinci yang dulu ada di `CLAUDE.md` (selain dua yang dihapus) bisa ditemukan di salah satu berkas `docs/`, dengan isi faktual yang sama: tidak ada angka, nama berkas, nomor tiket, atau aturan yang hilang atau berubah.
- [x] `CLAUDE.md` punya daftar isi `docs/` yang menyebut, untuk tiap berkas, isinya dan kapan wajib dibaca; setiap berkas di `docs/` ada di daftar itu, dan setiap berkas di daftar itu ada.
- [x] `CLAUDE.md` memuat aturan bahwa rincian fitur berikutnya ditulis di `docs/`, bukan di `CLAUDE.md`.
- [x] Rancangan bot berkirim pesan ke bot lain dan bagian "Status saat ini" tidak ada lagi di `CLAUDE.md` maupun `docs/`; pembatalannya tercatat singkat di `CLAUDE.md`.
- [x] Rujukan dari kode, tes, atau dokumen lain di repo ke bagian `CLAUDE.md` yang dipindah (kalau ada) diarahkan ke berkas `docs/` yang benar.
- [x] Tidak ada berkas selain dokumen yang berubah, dan seluruh tes tetap lulus.

## Out of scope

- Menulis ulang, memperbaiki, atau memperbarui isi rincian yang dipindah (misalnya versi Claude Code yang sudah lama); hanya dipindah.
- Dokumen di dalam `plugin/` (`README.md`, `ACCESS.md`).

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [unseen] Tiga komentar di kode (plugin/server.ts, master/src/launch.ts, scripts/start-bot.sh) yang merujuk CLAUDE.md diubah supaya menunjuk berkas docs/; hanya teks komentar, tidak ada kode yang berubah.
  Why: Butir 'rujukan dari kode diarahkan ke docs' meminta ini, walau butir terakhir menyebut hanya dokumen yang berubah.
  If wrong: Kembalikan tiga baris komentar itu ke teks lama.
- A2 [unseen] Bagian 'Concern yang harus ditangani' dan 'Fakta teknis dari plugin upstream' dipindah utuh ke docs/ (concern.md, menyalakan-bot.md); CLAUDE.md hanya memuat ringkasan concern yang masih terbuka dan jebakan lintas pekerjaan.
  Why: Kalau keduanya utuh di CLAUDE.md, batas 15 KB sulit dijaga dan isinya terduplikasi.
  If wrong: Salin kembali bagian itu dari docs/ ke CLAUDE.md.

## Handoff
CLAUDE.md diringkas dari 472 baris/92 KB menjadi 136 baris/12 KB: pedoman umum, jebakan lintas pekerjaan, concern terbuka, dan tabel daftar isi docs/. Rincian dipindah apa adanya (tanpa ditulis ulang) ke docs/master-bot.md, menyalakan-bot.md, fitur-chat-bot.md, log-bot.md, kuota.md, tes.md, concern.md. Rancangan bot berkirim pesan ke bot lain dan 'Status saat ini' dihapus. Tiga komentar kode kini merujuk docs/. Yang tidak boleh rusak: setiap berkas docs/ harus ada di tabel CLAUDE.md dan sebaliknya; rincian fitur baru masuk docs/, bukan CLAUDE.md; CLAUDE.md maksimal 150 baris dan 15 KB.

## Review
- 2026-11-15 standard, round 1, at 8e3df72: passed.
  1: wc -lc CLAUDE.md = 136 baris, 12279 byte. Dibaca utuh: terminologi, cara kerja, keputusan, struktur, data runtime, menjalankan master-bot dan tes, jebakan (satu poller, channel, bot.pid, 127.0.0.1, data asli pemilik), concern terbuka, prinsip, cara bekerja ada.
  2: Pembanding sendiri: tiap baris tidak kosong main:CLAUDE.md dicari persis di CLAUDE.md baru + docs/. Yang tak ditemukan hanya baris 344-431 (rancangan bot ke bot) dan 448-466 (Status). Pindahan mendarat sebagai blok utuh berurutan; baris baru di docs/ hanya judul dan pengantar.
  3: diff antara berkas di tabel CLAUDE.md dan ls docs/*.md kosong (7 berkas, dua arah); kolom Isi dan 'Wajib dibaca sebelum' terisi di tiap baris.
  4: CLAUDE.md baris 126-130: rincian fitur ditulis di docs/, bukan bagian baru di CLAUDE.md; butir 'CLAUDE.md diperbarui' berarti berkas docs/ diperbarui; batas 150 baris dan 15 KB.
  5: grep cari_bot, cross-session, ListAgents, SendMessage, cek_pengirim, uds:, 'Status saat ini' di CLAUDE.md dan docs/: nihil. Pembatalan di CLAUDE.md baris 97-99 (2026-11-15, manual lewat session-id, tiket 261112230309 dan 261113230601).
  6: git grep 'CLAUDE.md' di luar .kerjaan2: tak ada rujukan tersisa di kode atau tes. Tiga komentar (launch.ts, plugin/server.ts, start-bot.sh) menunjuk docs/menyalakan-bot.md dan docs/log-bot.md; berkas dan judul 'Menyalakan satu bot' ada.
  7: numstat: di luar CLAUDE.md dan docs/ hanya 1 baris komentar di tiga berkas itu (A1, diminta butir 6); mode tetap, bash -n start-bot.sh lulus. Tes tidak diulang: menurut brief sudah lulus pada isi yang sama (6e073a1153).
  note: rujukan silang 'lihat "<judul>"' di teks pindahan (concern.md, master-bot.md, menyalakan-bot.md, log-bot.md) kini menunjuk bagian di berkas docs/ lain tanpa nama berkas; hanya dijelaskan catatan umum di kepala tiap berkas. Tidak memblokir (dipindah apa adanya).
  note: repo tidak punya pemeriksaan lain (lint/CI) untuk dokumen; tidak ada perintah tambahan.
