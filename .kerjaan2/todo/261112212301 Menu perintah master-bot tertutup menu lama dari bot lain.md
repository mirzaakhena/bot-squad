---
type: bug
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: [master/src/main.ts, master/test/run.test.ts]
created: 2026-11-12 21:23
---

## Background

Saat master-bot menyala, ia mendaftarkan menu perintahnya ke Telegram. Token master-bot sebelumnya sempat dipakai sebagai bot uji oleh plugin bot-squad. Plugin itu mendaftarkan menunya sendiri (start, help, status) khusus untuk chat pribadi. Di Telegram, menu khusus chat pribadi mengalahkan menu umum yang didaftarkan master-bot. Akibatnya, di chat pribadi pemilik muncul menu plugin, bukan menu master-bot. /register tidak ada di menu dan ada /status yang tidak dikenal master-bot. Hal yang sama akan terjadi pada setiap token yang pernah dipakai bot lain.

Ditemukan pemilik saat cek manual tiket 261112184704 (2026-11-12).

## How to reproduce

1. Pakai token master-bot sebagai bot uji dengan skrip start bot, lalu matikan bot uji itu.
2. Jalankan master-bot dengan token yang sama.
3. Di chat pribadi dengan master-bot, ketik "/". Menu menampilkan start, help, dan status dengan deskripsi berbahasa Inggris, bukan start, help, dan register milik master-bot.

## Request

Setiap kali master-bot menyala, menu perintah yang dilihat pemilik di chat pribadi harus selalu persis daftar perintah master-bot, apa pun riwayat token itu sebelumnya.

## Done when

- [ ] Setelah master-bot menyala, menu di chat pribadi berisi tepat perintah master-bot (start, help, register) dengan deskripsi master-bot, walaupun token itu sebelumnya pernah dipakai bot lain.
- [ ] Setiap start, menu master-bot didaftarkan di cakupan default, all_private_chats, dan chat pribadi pemilik (tanpa kode bahasa), dan menu di cakupan all_group_chats dan all_chat_administrators dihapus. Menu sisa yang khusus bahasa tertentu tidak ditangani.
- [ ] Hal ini dibuktikan dengan tes otomatis yang mensimulasikan menu sisa dari bot lain.
- [ ] (owner) Pemilik menyalakan ulang master-bot, mengetik "/" di chat pribadi, dan melihat start, help, dan register.
- [ ] Gagal mendaftarkan menu tetap hanya berupa peringatan dan tidak menghentikan master-bot (kecuali 401/409 seperti sekarang).

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Telegram tidak bisa ditanya menu apa saja yang pernah didaftarkan, jadi master harus menimpa cakupan tertentu. Rekomendasi: setiap start, master mendaftarkan menunya di cakupan default, all_private_chats, dan chat pribadi pemilik (chat:<OWNER_TELEGRAM_ID>), tanpa kode bahasa. Menu sisa yang didaftarkan khusus bahasa tertentu tidak ditangani (plugin bot-squad tidak pernah membuatnya). Setuju?
  → Setuju. (owner, 2026-11-12)
- Q2 [answered] Menu di grup: master-bot tidak melayani grup. Rekomendasi: hapus menu di cakupan all_group_chats dan all_chat_administrators (deleteMyCommands) supaya sisa menu bot lain tidak muncul di grup, tanpa mendaftarkan menu master di sana. Atau biarkan grup tidak disentuh?
  → Menu di cakupan grup dan admin grup dihapus. (owner, 2026-11-12)

## Assumptions
- A1 [unseen] Kalau salah satu panggilan menu gagal (selain 401/409), panggilan lain tetap dicoba dan tiap kegagalan menjadi satu baris peringatan
  Why: Done when: gagal mendaftarkan menu hanya peringatan
  If wrong: Berhenti pada kegagalan pertama
- A2 [unseen] Worker tidak menjalankan master-bot dengan token asli; bukti otomatis memakai fake-telegram, cek asli dilakukan pemilik lewat baris (owner)
  Why: Arahan foreman: hanya token uji-01/uji-02 yang boleh dipakai agen; token master-bot tidak
  If wrong: -

## Decisions
- Lane standard: urutan start master-bot, aturan 401/409 harus tetap menghentikan
- Tidak solo dan tidak menunggu: tidak ada tiket lain yang membaca hasilnya; berbagi file (main.ts, CLAUDE.md) diselesaikan merge queue
