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

- [ ] `CLAUDE.md` paling banyak 150 baris dan 15 KB, dan tetap memuat semua butir "yang tetap di CLAUDE.md" di atas.
- [ ] Setiap bagian rinci yang dulu ada di `CLAUDE.md` (selain dua yang dihapus) bisa ditemukan di salah satu berkas `docs/`, dengan isi faktual yang sama: tidak ada angka, nama berkas, nomor tiket, atau aturan yang hilang atau berubah.
- [ ] `CLAUDE.md` punya daftar isi `docs/` yang menyebut, untuk tiap berkas, isinya dan kapan wajib dibaca; setiap berkas di `docs/` ada di daftar itu, dan setiap berkas di daftar itu ada.
- [ ] `CLAUDE.md` memuat aturan bahwa rincian fitur berikutnya ditulis di `docs/`, bukan di `CLAUDE.md`.
- [ ] Rancangan bot berkirim pesan ke bot lain dan bagian "Status saat ini" tidak ada lagi di `CLAUDE.md` maupun `docs/`; pembatalannya tercatat singkat di `CLAUDE.md`.
- [ ] Rujukan dari kode, tes, atau dokumen lain di repo ke bagian `CLAUDE.md` yang dipindah (kalau ada) diarahkan ke berkas `docs/` yang benar.
- [ ] Tidak ada berkas selain dokumen yang berubah, dan seluruh tes tetap lulus.

## Out of scope

- Menulis ulang, memperbaiki, atau memperbarui isi rincian yang dipindah (misalnya versi Claude Code yang sudah lama); hanya dipindah.
- Dokumen di dalam `plugin/` (`README.md`, `ACCESS.md`).
