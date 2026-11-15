---
type: task
priority: low
lane: light
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-15 10:15
---

## Background

Repo `mirzaakhena/bot-squad` di GitHub bersifat publik. Pada 2026-11-15 pemilik menerima email GitHub "Secrets detected" dengan dua temuan "Telegram Bot Token": `master/test/register-launch.test.ts` baris 12 (commit `0b17f463`) dan `master/test/logs.test.ts` baris 126 (commit `a5cf7249`).

Keduanya positif palsu: token buatan untuk tes (`123456789:AAFakeMasterTokenForLaunchFlow_abcd` dan `7777777:AAunknownTokenPart1xyzUnknownToken2`). Tes memang butuh teks berbentuk `<angka>:<huruf acak>` supaya pendaftaran bot dan penyensoran token bisa diuji. Seluruh riwayat git sudah diperiksa (157 commit): semua teks berbentuk token di repo adalah token tiruan sejenis.

Karena banyak tes memakai token tiruan, peringatan serupa akan muncul lagi setiap ada tes baru.

## Request

Token tiruan di folder tes tidak lagi memicu peringatan secret scanning GitHub, lewat pengaturan pengecualian path milik GitHub (`.github/secret_scanning.yml` dengan `paths-ignore`) untuk folder tes `master/test/` dan `plugin/test/`.

Akibat yang sudah diketahui dan diterima pemilik: token asli yang tidak sengaja masuk ke folder tes juga tidak akan terdeteksi GitHub. Karena itu pedoman proyek harus menyebut pengecualian ini dan mengingatkan bahwa folder tes hanya boleh berisi token tiruan.

Worker memeriksa bentuk berkas dan aturan pola path dari dokumentasi resmi GitHub, tidak dari ingatan.

## Done when

- [x] Repo punya pengaturan pengecualian secret scanning yang mencakup semua berkas di `master/test/` dan `plugin/test/`, dan tidak mencakup folder lain.
- [x] Bentuk berkas dan pola path-nya sesuai dokumentasi resmi GitHub (sumbernya disebut di tiket).
- [x] Dokumentasi proyek mencatat pengecualian ini, alasannya, dan bahwa folder tes hanya boleh berisi token tiruan.
- [x] Tidak ada kode atau tes yang berubah, dan seluruh tes tetap lulus.
- [ ] (owner) Dua peringatan yang sudah ada ditutup di GitHub (Security → Secret scanning) dengan alasan "Used in tests"; pengecualian path tidak menutup peringatan lama.
- [ ] (owner) Setelah perubahan ini di-push, tes baru yang memuat token tiruan tidak lagi memunculkan email peringatan.

## Out of scope

- Mengubah token tiruan di tes supaya tidak berbentuk token (tes penyensoran butuh bentuk itu).
- Menulis ulang riwayat git.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Manual checks
- M1 [waiting] (item 5) 1. GitHub, Security, Secret scanning.
  2. Tutup dua peringatan lama dengan alasan Used in tests (catatan: dokumen GitHub menyebut peringatan yang cocok pengecualian ditutup 'ignored by configuration'; cek dulu apakah sudah tertutup sendiri setelah push).
- M2 [waiting] (item 6) 1. Push perubahan ini ke main.
  2. Tambah tes sementara memuat token tiruan di master/test/, push.
  3. Cek tidak ada peringatan atau email baru, lalu buang tes itu.

## Handoff
Menambah .github/secret_scanning.yml (paths-ignore master/test/** dan plugin/test/**) supaya token tiruan di tes tidak memicu email secret scanning GitHub. Dokumentasi di docs/tes.md dan satu baris di CLAUDE.md. Tidak ada kode atau tes berubah. Jangan memperluas pengecualian ke folder lain: token asli di folder tes tidak akan terdeteksi, jadi tes hanya boleh memakai token tiruan.
