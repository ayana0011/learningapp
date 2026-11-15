"""YouTube の字幕を JSON で出力する（お手伝いプログラムから呼ぶ）。

使い方: python yt_transcript.py <動画ID>
出力: {"lang": "ko", "generated": false, "lines": [{"t": 3.2, "text": "..."}]}
韓国語の手動字幕 → 韓国語の自動生成字幕 の順で探す。
"""
import json
import sys

from youtube_transcript_api import YouTubeTranscriptApi


def main() -> None:
    video_id = sys.argv[1]
    api = YouTubeTranscriptApi()
    try:
        listing = api.list(video_id)
    except Exception as e:  # 字幕なし・非公開・存在しない など
        print(json.dumps({"error": f"字幕の一覧を取れませんでした: {type(e).__name__}"}, ensure_ascii=False))
        return
    found = None
    for finder in (listing.find_manually_created_transcript, listing.find_generated_transcript):
        try:
            found = finder(["ko"])
            break
        except Exception:
            continue
    if found is None:
        langs = ", ".join(t.language_code for t in listing)
        print(json.dumps({"error": f"韓国語の字幕がありません（あるのは: {langs or 'なし'}）"}, ensure_ascii=False))
        return
    data = found.fetch()
    lines = [{"t": round(s.start, 2), "end": round(s.start + s.duration, 2), "text": s.text.replace("\n", " ").strip()} for s in data]
    print(json.dumps({"lang": found.language_code, "generated": found.is_generated, "lines": lines}, ensure_ascii=False))


if __name__ == "__main__":
    main()
