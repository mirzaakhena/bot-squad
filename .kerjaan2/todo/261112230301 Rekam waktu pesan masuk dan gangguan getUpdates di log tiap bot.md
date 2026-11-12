---
type: task
priority: medium
lane: standard
labels: []
blocked_by: []
related: [261112223103]
touches: [plugin/server.ts, plugin/test, CLAUDE.md]
created: 2026-11-12 23:03
---

## Background

Pesan pertama ke bot baru kadang terlambat sampai beberapa menit (tiket 261112223103). Penyebabnya belum bisa dibuktikan karena tidak ada rekaman dari saat kejadian. stderr server plugin tidak tersimpan di mana pun, dan percobaan ulang `getUpdates` dari grammY tidak menulis apa pun kecuali `DEBUG=grammy:error` aktif. Pemilik memutuskan tiket 261112223103 dipecah: tiket ini menyiapkan rekaman yang selalu aktif, sedangkan pencarian penyebab menunggu sampai rekaman menangkap keterlambatan berikutnya.

## Request

Setiap bot selalu merekam kapan pesan masuk diterima dan diteruskan ke Claude, serta setiap gangguan saat mengambil pesan dari Telegram. Rekaman disimpan di folder state bot itu, sehingga keterlambatan berikutnya bisa dibuktikan dari log.

## Done when

- [ ] Server plugin setiap bot selalu menulis `state/plugin.log` di folder state bot itu (`TELEGRAM_STATE_DIR`), dengan permission 0600, tanpa perlu variabel atau flag tambahan.
- [ ] Setiap pesan masuk menghasilkan satu baris berisi tanggal pesan dari Telegram, waktu diterima plugin, waktu diteruskan ke Claude, dan selisihnya. Isi pesan tidak pernah ditulis.
- [ ] Setiap kegagalan atau percobaan ulang `getUpdates` dicatat dengan waktu dan alasannya, termasuk percobaan ulang internal grammY yang selama ini hanya terlihat dengan `DEBUG=grammy:error`. Mulai polling (`polling as @...`) dan berhenti juga dicatat dengan waktu.
- [ ] Token tidak pernah muncul di `plugin.log`, termasuk dari URL atau stack trace error grammY.
- [ ] Kalau `plugin.log` melewati sekitar 1 MB, file diputar sekali (`plugin.log.1` lama ditimpa), jadi total paling besar sekitar 2 MB per bot.
- [ ] Gagal menulis log (misalnya disk penuh atau folder tidak bisa ditulis) tidak menghentikan plugin dan tidak menghambat penerusan pesan ke Claude.
- [ ] CLAUDE.md menjelaskan letak log, arti tiap baris, dan cara membaca keterlambatan dari log itu.
- [ ] Dibuktikan dengan tes otomatis yang memakai Telegram tiruan, tanpa token asli.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [unseen] Agen tidak pernah menyalakan bot dengan token asli pemilik (uji-01..03), termasuk dari salinan folder state, dan tidak menyentuh ~/.bot-squad maupun proses pemilik. Semua uji memakai Telegram tiruan dan folder state sementara (salinan, tanpa symlink).
  Why: Satu poller per token (CLAUDE.md) dan arahan foreman.
  If wrong: Pemilik menyediakan token bot uji khusus agen.
- A2 [unseen] Baris pesan masuk boleh memuat chat_id dan message_id (bukan rahasia, dibutuhkan untuk mencocokkan dengan transkrip), dengan waktu dalam ISO 8601 beserta zona waktu.
  Why: Pemilik hanya melarang isi pesan dan token; ID dibutuhkan untuk mencocokkan kejadian.
  If wrong: Hapus ID dari baris log.
- A3 [unseen] Log ditulis oleh server plugin, bukan dengan menangkap stderr dari luar, jadi berlaku untuk setiap jalur penyalaan (master-bot dan start-bot.sh). Baris stderr yang sudah ada tetap dipertahankan.
  Why: Pelajaran proyek: stderr plugin tidak masuk ke log Claude, dan shim bun hanya bekerja di server tmux baru.
  If wrong: Pindahkan perekaman ke launch.ts.

## Decisions
- Lane standard: menambah log di plugin; tidak menyentuh login, izin, atau data yang tak bisa dipulihkan. Token harus tetap tersensor.
- Tidak solo dan tidak menunggu: berpusat di plugin/, tidak bersinggungan dengan 261112223101 dan 261112223102.
- Dipecah dari 261112223103 atas keputusan pemilik (Q4 a). Batas 5 detik dan percobaan pemilik tetap di 261112223103; tiket ini cukup membuktikan rekamannya.
