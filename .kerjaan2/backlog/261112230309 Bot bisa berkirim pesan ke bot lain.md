---
type: feature
priority: low
lane: strict
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-12 23:03
---

## Background

mirza-bots punya fitur bot berbicara dengan bot lain (bagian "Bicara ke bot lain" di README-nya). Di bot-squad belum ada, dan ini fitur besar tersendiri. Lane strict karena setiap bot berjalan dengan izin bebas, sehingga pesan antarbot bisa menjadi jalan menyuruh bot lain menjalankan apa saja.

Rujukan: aplikasi bot lama pemilik di /Users/mirza/Workspace/mirza-bots (README.md, bagian "Slash command dari Telegram"). Mekanisme di sana (wrapper yang mengetik ke TUI lewat folder slash/) tidak ada di bot-squad, jadi perlu disesuaikan, bukan disalin.

Catatan pemilik (2026-11-12): Claude Code sudah punya mekanisme bawaan untuk berkirim pesan antarsesi, asalkan session-id sesi tujuan diketahui. Sesi foreman bot-squad sendiri pernah menerima pesan dari sesi lain lewat mekanisme ini. Jadi kemungkinan besar yang perlu dibangun adalah mencatat session-id setiap bot (misalnya di daftar bot), bukan jalur pesan baru. Session-id yang tercatat juga berguna untuk /branch dan /switch (261112230308).

Keputusan pemilik (2026-11-13, diskusi dengan foreman):
- Bot menyebut tujuan hanya dengan **nama bot** (misalnya bot-02), tidak pernah dengan session-id. Session-id bisa berubah (restart, percakapan baru), jadi tidak boleh menjadi alamat yang dipegang bot.
- Pemilik **tidak setuju** menamai sesi Claude sama dengan nama bot sebagai cara pengalamatan.
- Yang diinginkan: mekanisme yang **mencari session-id terkini dari nama bot setiap kali** sebuah bot mau menghubungi bot itu. Dasarnya: satu bot selalu hidup di tepat satu sesi pada satu waktu. Lalu pesan dikirim lewat mekanisme bawaan Claude Code ke session-id itu.
- Izin awal: **semua bot terdaftar boleh mengirim ke semua bot terdaftar** (pemilik memilih ini walau semua bot berjalan bebas izin).
- Alternatif yang disebut foreman dan belum dipilih: kotak surat berkas per bot (pola mirza-bots, tanpa session-id). Kalau mekanisme bawaan Claude Code ternyata tidak bisa mengirim ke session-id (atau tidak aktif di sesi bot), hasil itu dibawa ke pemilik bersama alternatif ini, bukan diputuskan sendiri.

## Request

Sebuah bot bisa mengirim pesan ke bot lain milik pemilik hanya dengan menyebut nama bot tujuan, dan menerima jawabannya, tetap berfungsi setelah bot tujuan dinyalakan ulang atau memulai percakapan baru.

## Done when

- [ ] CLAUDE.md mencatat rancangan, termasuk batasan keamanannya, dan disetujui pemilik sebelum dibangun.
- [ ] Ada bukti nyata (spike) bahwa mekanisme bawaan Claude Code bisa mengirim pesan ke sesi bot lain berdasarkan session-id, di sesi yang dinyalakan seperti bot bot-squad; kalau tidak bisa, hasilnya dibawa ke pemilik sebelum lanjut.
- [ ] Nama bot dipetakan ke session-id terkininya setiap kali dibutuhkan, dan pemetaan itu tetap benar setelah bot dinyalakan ulang atau memulai percakapan baru.
- [ ] Bot bisa mengirim pesan ke bot lain hanya dengan menyebut nama bot, dan menerima jawaban.
- [ ] Mengirim ke nama yang tidak terdaftar atau ke bot yang sedang mati memberi jawaban yang jelas ke bot pengirim, tanpa pesan hilang diam-diam.
- [ ] Semua bot terdaftar boleh saling mengirim; pesan dari luar bot terdaftar ditolak.
- [ ] Pesan antarbot tidak berputar tanpa akhir (misalnya balasan tidak boleh meminta balasan lagi).
