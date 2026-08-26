#!/bin/zsh
# Double-click this file to open the chart maker in your browser.
# Paste a CSV, check the report, download the PNG. No command line needed.
cd "$(dirname "$0")" || exit 1

printf '\n  Gooey.AI chart maker\n'
printf '  ────────────────────\n\n'

if ! command -v node >/dev/null 2>&1; then
  printf '  Node.js is not installed. Install it from https://nodejs.org and try again.\n\n'
  read -r "?  Press return to close."
  exit 1
fi

if node build-app.mjs; then
  printf '\n  Opening in your browser...\n\n'
  open dist/app.html
  printf '  Paste your data, check the "fastest" and "most accurate" lines\n'
  printf '  against your source, then use the Download buttons.\n\n'
  printf '  The first chart needs an internet connection (it fetches the fonts).\n\n'
  read -r "?  Press return to close."
else
  printf '\n  Something went wrong — the message above says what.\n\n'
  read -r "?  Press return to close."
  exit 1
fi
