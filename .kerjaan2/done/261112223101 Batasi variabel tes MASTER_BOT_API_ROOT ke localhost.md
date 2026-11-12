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

- [x] Alamat selain mesin lokal (localhost, 127.0.0.1, ::1) ditolak: master-bot berhenti dengan pesan jelas sebelum memanggil Telegram, tanpa mencetak token.
- [x] Saat variabel itu dipakai dengan alamat lokal, terminal menampilkan peringatan bahwa master-bot tidak terhubung ke Telegram sungguhan.
- [x] Tanpa variabel itu, perilaku master-bot tidak berubah.
- [x] Ketiga hal di atas dibuktikan dengan tes otomatis.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [confirmed] Alamat dicek lewat hostname hasil parse URL, dibandingkan persis dengan localhost, 127.0.0.1, dan ::1 (ditulis [::1]); port bebas, skema http atau https. Bentuk seperti http://localhost@evil.com atau localhost.evil.com ditolak karena hostname-nya bukan mesin lokal.
  Why: Done when menyebut tepat tiga alamat itu; parse URL mencegah akal-akalan string.
  If wrong: Ubah daftar host yang diizinkan di main.ts dan tesnya.
  Confirmed by owner, 2026-11-12
- A2 [confirmed] Nilai yang tidak bisa di-parse sebagai URL, atau skema selain http/https, ditolak sama seperti alamat non-lokal (keluar kode 1, pesan jelas, token tidak dicetak). Nilai kosong atau hanya spasi tetap dianggap tidak di-set, seperti sekarang.
  Why: Lane strict: ragu berarti tolak; perilaku nilai kosong sudah ada dan Done when 3 meminta perilaku tanpa variabel tidak berubah.
  If wrong: Longgarkan validasi di main.ts.
  Confirmed by owner, 2026-11-12
- A3 [confirmed] Penolakan memakai kode keluar 1 dan diawali 'master-bot:' seperti ConfigError, dan pesannya menyebut nama variabel MASTER_BOT_API_ROOT serta alamat yang ditolak (alamat bukan rahasia).
  Why: Konvensi pesan error master-bot di CLAUDE.md dan main.ts.
  If wrong: Ubah teks pesan.
  Confirmed by owner, 2026-11-12
- A4 [confirmed] URL lokal yang memuat username atau password (mis. http://user:pass@localhost) juga ditolak
  Why: Lane strict; tidak ada pemakaian tes yang butuh userinfo dan bentuk ini mirip akal-akalan alamat
  If wrong: Hapus syarat username/password di api-root.ts dan kasus tesnya
  Confirmed by owner, 2026-11-12

## Decisions
- Lane strict: menyangkut ke mana token master-bot dan token bot (getMe di register.ts memakai apiRoot yang sama) dikirim.
- Tidak solo dan tidak menunggu: hanya mengubah cara main.ts membaca satu variabel; boleh berjalan berdampingan dengan 261112223102 (sama-sama menyentuh main.ts, diselesaikan antrean merge).
- Red-proof: penolakan di main.ts (exit 1 dihapus), cetak peringatan di main.ts, client tanpa variabel di main.ts, cek host/skema/username/password/daftar host/nilai kosong di api-root.ts; all red
- Validasi diletakkan di blok import.meta.main sebelum run(), jadi token belum dibaca saat penolakan dan run() untuk tes in-process tidak berubah; logikanya di file baru api-root.ts supaya bentrok dengan 261112223102 di main.ts sekecil mungkin.
- Tes proses main.ts memberi HTTPS_PROXY/HTTP_PROXY mati dan NO_PROXY hanya untuk alamat lokal, sehingga kode yang keliru lolos ke Telegram sungguhan gagal di mesin ini dan tidak pernah mengirim token.
- Red-proof: penolakan, peringatan, client tanpa variabel (alamat lokal dan alamat lain) di main.ts; cek host/skema/username/password/daftar host/nilai kosong di api-root.ts; all red

## Handoff
MASTER_BOT_API_ROOT divalidasi di master/src/api-root.ts (resolveApiRoot) dan dipakai di blok import.meta.main main.ts sebelum run(): hanya http/https ke hostname persis localhost, 127.0.0.1, atau [::1], tanpa userinfo. Selain itu keluar kode 1 dengan 'master-bot: MASTER_BOT_API_ROOT="..." ditolak' sebelum token dibaca; nilai lokal mencetak satu baris PERINGATAN di awal; kosong/spasi dianggap tidak di-set. run() in-process tidak berubah. Tes proses memakai proxy pencatat di HTTPS_PROXY (memutus koneksi, mencatat CONNECT) supaya tujuan jaringan terbukti tanpa keluar mesin. Jangan pindahkan cek ke sesudah loadConfig atau ke run().

## Review
- 2026-11-12 strict, round 1, at 20267ba: sent back.
  1: terpenuhi. Mutasi hapus process.exit(1) setelah penolakan di main.ts: 6 tes merah (mis. 'ditolak sebelum memanggil Telegram: skema bukan http', 'ditolak: alamat luar'). Proxy mati terbukti memblokir fetch Bun dan node-fetch grammY (kontrol tanpa proxy: 200), jadi tidak ada uji yang bocor ke api.telegram.org.
  2: terpenuhi oleh tes proses 127.0.0.1, localhost, [::1] yang mencocokkan baris pertama stderr persis.
  3 dan 4: tes 'main.ts tanpa MASTER_BOT_API_ROOT' menghapus .env sehingga proses berhenti di cek konfigurasi SEBELUM client dipakai; client yang dikirim main.ts ke run() saat variabel tidak di-set tidak pernah diperiksa. Mutasi di salinan: main.ts baris 150 ': undefined' jadi ': { apiRoot: "https://evil.example" }'. 'k2 test --dir <salinan> -- bun test': 292 pass / 0 fail, exit 0. Perbaikan: tes proses tanpa variabel (dan kosong/spasi) dengan token palsu di .env, proxy mati tetap ada, yang membuktikan tujuan permintaan api.telegram.org (mis. proxy tiruan lokal di HTTPS_PROXY yang mencatat CONNECT host lalu menolaknya) sehingga mutasi itu merah.
  note: tidak ada AGENTS.md; CLAUDE.md tidak menetapkan perintah cek selain tes. Salinan uji tanpa symlink (bun install --linker hoisted).
- 2026-11-12 strict, round 2, at 85558ed: passed.
  1: dibawa dari ronde 1 (api-root.ts dan blok validasi main.ts tidak berubah, hanya bergeser karena merge main); 38 tes api-root hijau di salinan, dan tes penolakan kini juga memeriksa proxySeen kosong.
  2: dibawa dari ronde 1; tes peringatan 127.0.0.1/localhost/[::1] hijau, kode tidak berubah.
  3: temuan ronde 1 diuji ulang: mutasi ': undefined' jadi '{ apiRoot: "https://evil.example" }' -> 3 tes 'tetap ke api.telegram.org' merah (suite 306 pass / 3 fail); varian 'http://127.0.0.1:1' juga 3 merah. Proxy pencatat memutus setelah CONNECT, token tidak keluar.
  4: tes otomatis ketiganya di master/test/api-root.test.ts, terbukti merah pada mutasi di atas.
  note: salinan uji tanpa symlink (bun install --linker hoisted), tanpa token asli, tanpa ~/.bot-squad; tidak ada AGENTS.md.
