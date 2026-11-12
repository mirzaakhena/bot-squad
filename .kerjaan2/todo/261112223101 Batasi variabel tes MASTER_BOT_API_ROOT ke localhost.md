---
type: bug
priority: medium
lane: strict
labels: []
blocked_by: []
related: [261112211002]
touches: [master/src/main.ts, master/test/run.test.ts, master/test/lock.test.ts, CLAUDE.md]
created: 2026-11-12 22:31
---

## Background

Untuk keperluan tes, master-bot membaca variabel lingkungan yang bisa mengganti alamat server Telegram. Kalau variabel itu ter-set di lingkungan produksi, entah tidak sengaja atau karena disusupi, master-bot akan mengirim tokennya ke server lain. Reviewer tiket 261112211002 menilai ini tidak membuka celah baru, tetapi mengusulkan pembatasan.

## Request

Variabel pengganti alamat Telegram hanya boleh menunjuk ke mesin lokal. Kalau variabel itu aktif, pemilik diberi tahu dengan jelas di terminal.

## Done when

- [ ] Alamat selain mesin lokal (localhost, 127.0.0.1, ::1) ditolak: master-bot berhenti dengan pesan jelas sebelum memanggil Telegram, tanpa mencetak token.
- [ ] Saat variabel itu dipakai dengan alamat lokal, terminal menampilkan peringatan bahwa master-bot tidak terhubung ke Telegram sungguhan.
- [ ] Tanpa variabel itu, perilaku master-bot tidak berubah.
- [ ] Ketiga hal di atas dibuktikan dengan tes otomatis.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [unseen] Alamat dicek lewat hostname hasil parse URL, dibandingkan persis dengan localhost, 127.0.0.1, dan ::1 (ditulis [::1]); port bebas, skema http atau https. Bentuk seperti http://localhost@evil.com atau localhost.evil.com ditolak karena hostname-nya bukan mesin lokal.
  Why: Done when menyebut tepat tiga alamat itu; parse URL mencegah akal-akalan string.
  If wrong: Ubah daftar host yang diizinkan di main.ts dan tesnya.
- A2 [unseen] Nilai yang tidak bisa di-parse sebagai URL, atau skema selain http/https, ditolak sama seperti alamat non-lokal (keluar kode 1, pesan jelas, token tidak dicetak). Nilai kosong atau hanya spasi tetap dianggap tidak di-set, seperti sekarang.
  Why: Lane strict: ragu berarti tolak; perilaku nilai kosong sudah ada dan Done when 3 meminta perilaku tanpa variabel tidak berubah.
  If wrong: Longgarkan validasi di main.ts.
- A3 [unseen] Penolakan memakai kode keluar 1 dan diawali 'master-bot:' seperti ConfigError, dan pesannya menyebut nama variabel MASTER_BOT_API_ROOT serta alamat yang ditolak (alamat bukan rahasia).
  Why: Konvensi pesan error master-bot di CLAUDE.md dan main.ts.
  If wrong: Ubah teks pesan.

## Decisions
- Lane strict: menyangkut ke mana token master-bot dan token bot (getMe di register.ts memakai apiRoot yang sama) dikirim.
- Tidak solo dan tidak menunggu: hanya mengubah cara main.ts membaca satu variabel; boleh berjalan berdampingan dengan 261112223102 (sama-sama menyentuh main.ts, diselesaikan antrean merge).
