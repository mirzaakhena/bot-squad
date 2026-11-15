# Membaca kuota akun Claude

Hasil riset sumber kuota akun Claude yang dipakai `/quota` di master-bot.

Rincian ini dipindahkan apa adanya dari `CLAUDE.md` (tiket 261115094501). Rujukan `lihat "<judul bagian>"` yang tidak ada di berkas ini menunjuk ke bagian di berkas `docs/` lain; cari lewat daftar isi di `CLAUDE.md`.

## Membaca kuota akun Claude (riset tiket 261112225308, Claude Code 2.1.323)

Tujuannya `/quota` di master-bot. Kesimpulan: **layak** (sudah dibuat di tiket 261113192501, lihat `/quota` di "Menjalankan master-bot"), dengan sumber utama `rate_limits` di `status.json` bot dan umur datanya ditampilkan (keputusan pemilik Q3: data terakhir plus umurnya cukup; tidak harus segar saat diminta). Riset ini tidak membaca kredensial akun Claude (keputusan pemilik Q1). Diuji dengan satu sesi Claude (akun Ultra, model haiku, workspace di scratchpad, server tmux terpisah, tanpa plugin bot-squad, dua giliran pendek) yang statusline-nya merekam setiap payload.

| Sumber | Cara membaca | Andal? | Batasan |
| :- | :- | :- | :- |
| **`rate_limits` di payload statusline** (dipakai) | Sudah ditangkap bridge `/context` ke `<state>/status.json` tiap bot. `/quota` cukup membaca `status.json` semua bot terdaftar dan memakai yang `captured_at_ms`-nya paling baru (hanya membaca, tidak menulis apa pun) | Ya. Field terdokumentasi resmi (code.claude.com/docs/en/statusline), tanpa token, tanpa panggilan jaringan dari master | Lihat poin di bawah tabel |
| Layar `/usage` di sesi interaktif | Ketik `/usage` di tmux lalu baca layar | Tidak untuk master | Membuka dialog di sesi bot (mengganggu bot yang sedang kerja, butuh `Esc`), teksnya bisa berubah antar versi, endpointnya dibatasi rate (dokumentasi: kalau gagal, layar memakai data terakhir maks. 60 menit). Tidak tercatat bisa dipakai dengan `claude -p` |
| `cachedUsageUtilization` di `~/.claude.json` | Ditulis Claude Code saat layar `/usage` mengambil data (`fetchedAtMs`, `utilization.seven_day.{utilization,resets_at}`, `limits[]` termasuk batas per model seperti `Fable`) | Tidak | Tidak terdokumentasi (banyak kunci internal), hanya diperbarui kalau seseorang membuka `/usage`, berisi `accountUuid`, dan berkasnya ditulis ulang semua sesi Claude. Jangan dipakai |
| Endpoint usage OAuth (yang dipakai `/usage`) | Butuh token OAuth akun dari keychain/berkas kredensial | **Belum diuji** (Q1: kredensial tidak disentuh) | Tidak terdokumentasi untuk pihak ketiga, rate limited, dan butuh master memegang token akun. Hanya dipertimbangkan kalau pemilik nanti memutuskan lain |

Fakta `rate_limits` yang teramati dan terdokumentasi:

- Isinya `five_hour` dan/atau `seven_day`, masing-masing `used_percentage` (bilangan bulat 0-100 di uji ini) dan `resets_at` (detik epoch). Hanya untuk langganan claude.ai (Pro, Max, Ultra); dengan API key tidak ada. Tiap jendela bisa absen sendiri-sendiri, dan Claude Code membuangnya begitu `resets_at` lewat. Di akun ini hanya `seven_day` yang muncul; `/usage` juga tidak menampilkan jendela 5 jam.
- Angkanya berlaku untuk **seluruh akun** (dari jawaban API terakhir sesi itu), bukan hanya pemakaian bot itu. Jadi `status.json` bot mana pun yang terbaru sudah mewakili akun.
- Di uji ini `rate_limits.seven_day` sudah ada sekitar 4 detik setelah start, sebelum giliran pertama, padahal dokumentasi dan uji tiket 261112230304 menyebut baru ada setelah jawaban API pertama. Anggap bisa ada atau tidak sebelum giliran pertama.
- Angkanya **tidak bergerak tanpa panggilan API**: statusline dengan `refreshInterval` 5 detik tetap memberi angka yang sama saat sesi menganggur. Bot yang menganggur lama berarti angka basi. Umurnya dari `captured_at_ms` di `status.json`, yang menyatakan kapan statusline terakhir digambar ulang, bukan kapan angkanya terakhir berubah; pemicu ulang tanpa giliran (misalnya `/compact` atau ganti mode izin) bisa membuatnya tampak lebih segar dari sebenarnya. Karena itu `/quota` harus menampilkan umur dan menyebut bot sumbernya.
- Bisa sedikit lebih rendah dari `/usage`: di uji ini statusline `36` sementara `/usage` dan `cachedUsageUtilization` `37` pada saat yang sama, juga setelah giliran berikutnya. Selisih ~1 poin, kemungkinan pembulatan.
- Tidak ada rincian per model (`/usage` menampilkan juga `Current week (Fable) 28%`), tidak ada kredit tambahan, dan tidak ada angka token atau dolar.
- Hanya ada di bot yang bridge-nya terpasang (`statusline.json` menyatakan terpasang). Bot yang dinyalakan sebelum fitur `/context` atau yang statusline-nya ditolak pagar tidak punya `status.json`. Kalau tidak ada satu pun bot dengan data, `/quota` harus bilang begitu, bukan menebak.
