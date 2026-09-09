#!/usr/bin/env bash
set -euo pipefail
python3 tools/demo-video/capture.py
python3 tools/demo-video/capture.py --record
mkdir -p artifacts/public-demo/media
ffmpeg -y -hide_banner -loglevel error -ss 1 -i artifacts/public-demo/record/raw.webm -vf fps=24 -c:v libx264 -crf 19 -preset medium -pix_fmt yuv420p -movflags +faststart -an artifacts/public-demo/media/demo.mp4
ffmpeg -y -hide_banner -loglevel error -ss 3 -i artifacts/public-demo/media/demo.mp4 -frames:v 1 artifacts/public-demo/media/poster.png
ffmpeg -y -hide_banner -loglevel error -i artifacts/public-demo/media/demo.mp4 -vf 'fps=1/7,scale=480:-1,tile=3x2' -frames:v 1 artifacts/public-demo/media/contact.png
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,pix_fmt -of json artifacts/public-demo/media/demo.mp4 > artifacts/public-demo/media/metadata.json
