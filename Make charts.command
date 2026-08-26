#!/bin/zsh
# Double-click this file to rebuild every chart in charts/ and open the preview.
cd "$(dirname "$0")" || exit 1

printf '\n  Building Gooey.AI eval charts\n'
printf '  ─────────────────────────────\n\n'

if ! command -v node >/dev/null 2>&1; then
  printf '  Node.js is not installed. Install it from https://nodejs.org and try again.\n\n'
  read -r "?  Press return to close."
  exit 1
fi

if node build.mjs && node export-png.mjs; then
  printf '\n  Done. Opening the preview...\n\n'
  open dist/index.html
  printf '  Finished files are in the "dist" folder:\n'
  printf '    .html  = the file to put on the website\n'
  printf '    .png   = the image for slides and social\n\n'
  read -r "?  Press return to close."
else
  printf '\n  Something went wrong — the message above says what.\n'
  printf '  Most often it is a typo in a CSV file in the "charts" folder.\n\n'
  read -r "?  Press return to close."
  exit 1
fi
