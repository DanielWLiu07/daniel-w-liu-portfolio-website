#!/usr/bin/env bash
set -euo pipefail
# Preserve every glyph and the original sbix colour bitmap artwork. SVG embeds
# a duplicate artwork representation; the authored source stays untouched.
pyftsubset 'public/shared/fonts/Katie Roze Watercolour Font - By Lef/KatieRoze.woff2' \
  --glyphs='*' --drop-tables+='SVG ' --flavor=woff2 \
  --output-file=public/fonts/KatieRoze-web.woff2 \
  --layout-features='*' --name-IDs='*' --name-languages='*'
