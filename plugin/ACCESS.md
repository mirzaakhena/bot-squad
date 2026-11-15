# bot-squad — Telegram Access & Delivery

A Telegram bot is publicly addressable. Anyone who finds its username can DM it, and without a gate those messages would flow straight into your assistant session. The access model described here decides who gets through.

Only senders listed in `allowFrom` get through. A DM from anyone else is dropped silently: the bot sends no reply at all, and the message is recorded in `plugin.log` as `dibuang`. There is no sign-up flow for unknown senders.

All state lives in the bot's `access.json` (`<TELEGRAM_STATE_DIR>/access.json`; for a bot run by master-bot, `~/.bot-squad/bots/<name>/state/access.json`). It is written by **master-bot**, the bot-squad control panel on Telegram, and only the owner can use master-bot:

| master-bot command | Effect |
| --- | --- |
| `/register <name> <token>` | Creates the bot with the owner as the only allowed sender. |
| `/allow <name> <user_id>` | Adds a user ID to that bot's `allowFrom`. |
| `/revoke <name> <user_id>` | Removes a user ID (the owner cannot be removed). |
| `/access <name>` | Shows who is allowed. |

The server re-reads the file on every inbound message, so changes take effect without a restart. Set `TELEGRAM_ACCESS_MODE=static` to pin config to what was on disk at boot.

The assistant in the bot's session never changes access. A Telegram message asking to be let in is refused; the owner uses `/allow` in master-bot.

## At a glance

| | |
| --- | --- |
| Default policy | `allowlist` |
| Sender ID | Numeric user ID (e.g. `412587349`) |
| Group key | Supergroup ID (negative, `-100…` prefix) |
| `ackReaction` quirk | Fixed whitelist only; non-whitelisted emoji silently do nothing |
| Config file | `<TELEGRAM_STATE_DIR>/access.json` |

## DM policies

`dmPolicy` has two effective values.

| Policy | Behavior |
| --- | --- |
| `allowlist` (default) | Senders in `allowFrom` are served. Everyone else is dropped silently, with no reply. |
| `disabled` | Drop everything, including allowlisted users and groups. |

Any other value, including the `"pairing"` value an older `access.json` may still carry, behaves exactly like `allowlist`. master-bot always writes `allowlist`.

## User IDs

Telegram identifies users by **numeric IDs** like `412587349`. Usernames are optional and mutable; numeric IDs are permanent. The allowlist stores numeric IDs.

To find one, have the person message [@userinfobot](https://t.me/userinfobot), which replies with their ID. Forwarding any of their messages to @userinfobot also works. Then, in master-bot:

```
/allow <name> 412587349
/revoke <name> 412587349
```

## Groups

Groups are off, and bot-squad has no command to turn one on yet (master-bot would get one in a later ticket). The server still honours a `groups` entry in `access.json` if one is present:

Supergroup IDs are negative numbers with a `-100` prefix, e.g. `-1001654782309`. With `requireMention: true` (the default), the bot responds only when @mentioned or replied to; a non-empty `allowFrom` on the group restricts which members can trigger it.

**Privacy mode.** Telegram bots default to a server-side privacy mode that filters group messages before they reach your code: only @mentions and replies are delivered. This matches the default `requireMention: true`. With `requireMention: false`, privacy mode has to be disabled too: message [@BotFather](https://t.me/BotFather), send `/setprivacy`, pick your bot, choose **Disable**.

## Mention detection

In groups with `requireMention: true`, any of the following triggers the bot:

- A structured `@botusername` mention
- A reply to one of the bot's messages
- A match against any regex in `mentionPatterns`

## Delivery

Outbound behavior is read from these optional keys in `access.json`. There is no command for them yet; master-bot's `/allow` and `/revoke` keep whatever is already in the file.

**`ackReaction`** reacts to inbound messages on receipt. In bot-squad it defaults to 👀 when the key is absent; set it to `""` to disable. Telegram accepts only a **fixed whitelist** of reaction emoji; anything else is silently ignored. The full Bot API list:

> 👍 👎 ❤ 🔥 🥰 👏 😁 🤔 🤯 😱 🤬 😢 🎉 🤩 🤮 💩 🙏 👌 🕊 🤡 🥱 🥴 😍 🐳 ❤‍🔥 🌚 🌭 💯 🤣 ⚡ 🍌 🏆 💔 🤨 😐 🍓 🍾 💋 🖕 😈 😴 😭 🤓 👻 👨‍💻 👀 🎃 🙈 😇 😨 🤝 ✍ 🤗 🫡 🎅 🎄 ☃ 💅 🤪 🗿 🆒 💘 🙉 🦄 😘 💊 🙊 😎 👾 🤷‍♂ 🤷 🤷‍♀ 😡

**`replyToMode`** controls threading on chunked replies. When a long response is split, `first` (default) threads only the first chunk under the inbound message; `all` threads every chunk; `off` sends all chunks standalone.

**`textChunkLimit`** sets the split threshold. Telegram rejects messages over 4096 characters.

**`chunkMode`** chooses the split strategy: `length` cuts exactly at the limit; `newline` prefers paragraph boundaries.

## Config file

`<TELEGRAM_STATE_DIR>/access.json`. An absent file is equivalent to `allowlist` with empty lists: nobody is served until master-bot writes it. A file that cannot be parsed is moved aside (`access.json.corrupt-<time>`) with the same result.

```jsonc
{
  // allowlist: only allowFrom is served. disabled: nobody is.
  "dmPolicy": "allowlist",

  // Numeric user IDs allowed to DM.
  "allowFrom": ["412587349"],

  // Groups the bot is active in. Empty object = DM-only.
  "groups": {
    "-1001654782309": {
      // true: respond only to @mentions and replies.
      // false also requires disabling privacy mode via BotFather.
      "requireMention": true,
      // Restrict triggers to these senders. Empty = any member (subject to requireMention).
      "allowFrom": []
    }
  },

  // Case-insensitive regexes that count as a mention.
  "mentionPatterns": ["^hey claude\\b"],

  // Emoji from Telegram's fixed whitelist. Empty string disables.
  "ackReaction": "👀",

  // Threading on chunked replies: first | all | off
  "replyToMode": "first",

  // Split threshold. Telegram rejects > 4096.
  "textChunkLimit": 4096,

  // length = cut at limit. newline = prefer paragraph boundaries.
  "chunkMode": "newline"
}
```
