# Lessons

What earlier tickets learned about this project. Newest last; k2 keeps the last 60.

- Peringatan 'plugin:<x>@inline · plugin not installed' di layar awal Claude Code itu palsu untuk --plugin-dir; cek 'Channel notifications registered' di --debug-file
- Trust folder Claude Code diwariskan dari folder induk; dialog trust dan bypass default-nya 'No, exit', jadi jangan kirim Enter buta ke sesi tmux
- Pesan stderr server plugin (mis. 'polling as @user') tidak masuk --debug-file maupun mcp-logs Claude; rekam lewat shim bun di PATH yang men-tee stderr sebelum start-bot.sh
- k2 test menggabungkan argumen tanpa kutip, jadi bash -c "..." pecah; tulis perintah ke skrip di scratchpad lalu jalankan skrip itu
- Error jaringan grammY (HttpError) membawa URL api.telegram.org/bot<token>/...; promise grammY yang tidak ditangkap akan mencetak token di stack trace
- Tes master-bot memakai master/test/fake-telegram.ts (Bun.serve + client.apiRoot); jangan pernah memakai token asli di tes
- bun install paralel di satu folder gagal (EEXIST pada .bin) walau node_modules lengkap; plugin bot-squad tidak boleh install sendiri, start-bot.sh yang install dengan kunci
- Di zsh, argumen '=nama' tanpa kutip (mis. tmux -t =uji-01) diekspansi jadi path perintah; selalu kutip '=uji-01'
- createMasterBot wajib diberi dataDir; di tes arahkan ke folder sementara, dan tulis registry.json hanya lewat writeRegistry di dalam serialized()
- startFakeTelegram menerima argumen ketiga (token -> jawaban getMe) untuk token bot lain; stray.count menghitung permintaan dengan token tak dikenal
- Bukti 'server plugin ikut mati' setelah kill -9 claude harus dicek beberapa detik kemudian dengan ps (pid, ppid, %CPU), bukan dari hilangnya bot.pid: shutdown menghapus bot.pid sebelum proses benar-benar keluar.
- Fake sleep di tes loop tunggu harus melempar error setelah melewati batas jauh, kalau tidak loop tanpa henti membuat bun test hang tanpa timeout
- tmux server mengambil PATH dari klien pertama; untuk menguji jalur gagal, taruh claude tiruan di depan PATH saat belum ada server tmux, lalu matikan sesinya dengan kill-session (bukan kill-server)
