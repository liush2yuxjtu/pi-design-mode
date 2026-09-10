#!/usr/bin/env bash
set -euo pipefail
# Run on the approved remote rendering host, never the maintainer's laptop.
cd "$(dirname "$0")/../site"
for name in demo demo-en; do
  ffmpeg -hide_banner -loglevel error -i "$name.mp4" \
    -filter_complex '[0:v]fps=8,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle' \
    -loop 0 -y "$name.gif"
done
