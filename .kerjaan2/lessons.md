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
