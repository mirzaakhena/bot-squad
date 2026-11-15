# Log tiap bot dan keterlambatan pesan

Format `state/plugin.log`, cara membaca keterlambatan pesan, dan catatan kejadian keterlambatan pesan pertama ke bot baru.

Rincian ini dipindahkan apa adanya dari `CLAUDE.md` (tiket 261115094501). Rujukan `lihat "<judul bagian>"` yang tidak ada di berkas ini menunjuk ke bagian di berkas `docs/` lain; cari lewat daftar isi di `CLAUDE.md`.

## Log tiap bot (`state/plugin.log`, tiket 261112230301)

Server plugin setiap bot selalu menulis `<TELEGRAM_STATE_DIR>/plugin.log` (untuk bot master-bot: `~/.bot-squad/bots/<nama>/state/plugin.log`), tanpa variabel atau flag tambahan, lewat jalur penyalaan apa pun. Kodenya di `plugin/log.ts`, dipanggil dari `plugin/server.ts`. Baris stderr yang lama tetap ada.

- File `0600`. Kalau melewati ~1 MB, file diputar sekali ke `plugin.log.1` (yang lama ditimpa), jadi paling besar ~2 MB per bot. File lama dari proses sebelumnya ikut dihitung.
- Isi pesan tidak pernah ditulis. Token disensor dari setiap baris (token itu sendiri, bentuk ter-encode di URL, dan apa pun yang berbentuk token), dan stack trace tidak ditulis.
- Gagal menulis (disk penuh, folder tidak bisa ditulis) hanya memunculkan satu peringatan `cannot write plugin.log` di stderr; plugin tetap jalan dan pesan tetap diteruskan. Penulisan dicoba lagi di baris berikutnya.
- Setiap baris: `<waktu lokal ISO 8601 + zona> <peristiwa> kunci=nilai ...`. Nilai teks bebas (`alasan`) diberi tanda kutip.

| Peristiwa | Arti |
| :- | :- |
| `mulai pid=<pid>` | Server plugin menyala. |
| `polling-mulai bot=@<username>` | Polling berjalan (sama dengan `polling as @...` di stderr). Muncul lagi setiap kali polling dimulai ulang. |
| `pesan hasil=<hasil> chat= msg= jenis= tanggal= diterima= diteruskan= telat_terima= telat_teruskan= total=` | Satu baris per pesan masuk. `tanggal` = tanggal pesan dari Telegram (resolusi detik), `diterima` = saat `getUpdates` mengembalikan pesan itu, `diteruskan` = saat notifikasi selesai ditulis ke Claude. `telat_terima` = diterima - tanggal, `telat_teruskan` = diteruskan - diterima, `total` = diteruskan - tanggal. `hasil`: `diteruskan`, `izin` (jawaban izin `yes/no xxxxx`), `dibuang` (pengirim tidak di allowlist), `tidak-diteruskan` (perintah plugin `/start`, `/help`, `/status`, `/context`, atau jenis pesan yang tidak didukung), `gagal` (notifikasi ke Claude gagal, ada `alasan`). Selain `diteruskan`/`izin`, kolom waktu teruskan berisi `-`. Item album punya kolom `album=<media_group_id>` (tiket 261114101204). |
| `getUpdates-gagal ke=<n> durasi= ulang= alasan=` | Satu panggilan `getUpdates` gagal. `ke` = kegagalan ke berapa berturut-turut, `durasi` = lama panggilan itu sampai gagal (koneksi yang macet terlihat di sini, batas client grammY 500 detik), `ulang` = jeda sebelum grammY mencoba lagi (`3s`, atau `retry_after` untuk 429), atau `oleh-plugin` untuk 401/409 yang dilempar ke loop plugin. Ini percobaan ulang internal grammY yang dulu hanya terlihat dengan `DEBUG=grammy:error`. |
| `getUpdates-pulih gagal=<n> sejak= lama=` | `getUpdates` pertama yang berhasil setelah gangguan: berapa kali gagal, sejak kapan, dan berapa lama gangguannya. |
| `polling-gagal ke= ulang= alasan=` | `bot.start` gagal (misalnya 409, atau `getMe` gagal saat start), lalu loop plugin mencoba lagi. |
| `polling-berhenti alasan=` | Polling berhenti: `bot.stop`, `shutdown`, atau 409 yang terus terjadi. |
| `berhenti alasan=` | Server plugin mulai berhenti: `stdin-end`/`stdin-close`/`stdin-tertutup` (Claude pergi), `stderr-putus`, `SIGTERM`, `SIGINT`, `SIGHUP`. |
| `format-ditolak alat= potongan=<i>/<n> alasan=` | `alat` = `reply` atau `edit_message`. Telegram menolak format satu potongan balasan (400 `can't parse entities` dan sejenisnya), lalu potongan itu dikirim ulang sebagai teks biasa (tiket 261114101205). `potongan` hanya untuk `reply`. Isi pesan tidak ditulis. |
| `tombol hasil=<hasil> chat= msg=` | Satu baris per ketukan tombol pilihan dari Claude (tiket 261114101206). `msg` = id pesan bertombol. `hasil`: `diteruskan`, `jawab-sendiri` (tombol `✏️ Explain manually`), `dibuang` (pengirim tidak di `allowFrom`, ada `dari=`), `ganda` (keyboard sudah dicopot atau pesan sudah dijawab), `gagal` (notifikasi ke Claude gagal, ada `alasan`). Tombol izin tidak dicatat di sini. |
| `error jenis= alasan=` | Error handler, unhandled rejection, atau uncaught exception. |
| `api-tiruan alamat=` | Hanya di tes (lihat di bawah). |

Cara membaca keterlambatan: cari baris `pesan` dengan `msg` yang sama dengan `message_id` di transkrip. `total` besar dengan `telat_terima` besar berarti pesan terlambat sampai ke plugin (di Telegram atau jaringan); lihat baris `getUpdates-gagal`/`getUpdates-pulih` di sekitar `tanggal` itu untuk penyebabnya. Kalau tidak ada gangguan tercatat tetapi `telat_terima` besar, curigai satu `getUpdates` yang menggantung tanpa error (akan terlihat sebagai `durasi` panjang kalau akhirnya gagal). `telat_teruskan` besar berarti plugin lambat meneruskan (misalnya unduh foto). Kalau `diteruskan` cepat tetapi Claude baru bereaksi lama kemudian (dibanding waktu catatan di transkrip), jedanya ada di Claude. `telat_terima` bisa sedikit negatif (sampai -1 detik) karena `tanggal` dibulatkan ke detik.

`BOT_SQUAD_TELEGRAM_API_ROOT` hanya untuk tes: mengarahkan server plugin ke Telegram tiruan. Hanya `http(s)://localhost`, `127.0.0.1`, atau `[::1]` yang diterima; nilai lain membuat server keluar dengan kode 1 tanpa mencetak token. Tesnya `plugin/test/log.test.ts` dan `plugin/test/plugin-log.test.ts` (dilewati kalau `plugin/node_modules` belum dipasang).

## Keterlambatan pesan pertama ke bot baru

- **Keterlambatan pesan pertama ke bot baru (penyebab belum diketahui).** Pada cek tiket 261112184706, pesan "hallo" ke uji-03 bertanggal 21.34.40 di Telegram, tetapi baru masuk ke sesi Claude pukul 21.36.34 (sekitar 114 detik, terlihat dari transkrip sesi uji-03: atribut `ts` dibanding waktu catatan pertama). Yang sudah diperiksa: (1) plugin meneruskan pesan teks ke Claude seketika, tanpa menunggu panggilan jaringan apa pun, jadi jeda terjadi sebelum `getUpdates` menerima pesan, bukan di Claude; (2) sesi Claude saat itu menganggur (catatan pertama transkrip adalah pesan itu sendiri); (3) Mac tidak tidur di rentang itu (`pmset -g log`); log jaringan macOS untuk rentang itu tidak tersedia. Dugaan terkuat: koneksi ke Telegram terganggu (cocok dengan gagalnya laporan master-bot). Saat koneksi putus, grammY mengulang `getUpdates` setiap 3 detik sendiri, jadi jeda kira-kira sama dengan lama gangguan; kalau koneksinya macet tanpa error, satu `getUpdates` bisa menggantung sampai batas waktu client grammY (default 500 detik). Loop percobaan ulang di `plugin/server.ts` (maks. 15 detik) hanya dipakai kalau `bot.start` sendiri gagal. Belum dibuktikan karena tidak ada log stderr plugin uji-03 dari saat itu. Sejak tiket 261112230301, setiap bot selalu merekam waktu pesan masuk dan setiap gangguan `getUpdates` (termasuk percobaan ulang internal grammY) di `state/plugin.log`, jadi kejadian berikutnya bisa dibuktikan dari log itu (lihat "Log tiap bot").
