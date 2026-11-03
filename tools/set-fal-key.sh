#!/bin/bash
# Keeps a fal key where tools/make-sound.mjs can find it, readable only by you, and out of the shell history, the repo, the chat and every other program's environment.
# It has to wait for you to type, so it needs a real terminal.
set -e
file="${XDG_CONFIG_HOME:-$HOME/.config}/chunky/fal-key"
if [ ! -t 0 ]; then echo "This needs a real terminal to type the key into, so nothing was saved." >&2; exit 1; fi
read -rsp "Paste your fal key and press Return (it won't show): " key
echo
if [ -z "$key" ]; then echo "Nothing entered, so nothing was saved." >&2; exit 1; fi
mkdir -p "$(dirname "$file")"
(umask 077; printf '%s\n' "$key" > "$file")
chmod 600 "$file"
echo "Saved, ${#key} characters. You can close this tab."
