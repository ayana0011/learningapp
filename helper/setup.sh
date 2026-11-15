#!/bin/sh
# YouTube の字幕取得に使う Python ライブラリを helper/.venv に入れる（最初の1回だけ）
cd "$(dirname "$0")"
python3 -m venv .venv && ./.venv/bin/pip install -q youtube-transcript-api==1.2.5 && echo "準備できました"
