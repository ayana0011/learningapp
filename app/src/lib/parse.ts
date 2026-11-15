import type { Line } from './types'

const HANGUL = /[가-힣]/
const KANA_KANJI = /[぀-ヿ一-龯]/

/** "1:02:03" / "12:34" / "0:05" → 秒 */
export function parseClock(s: string): number | undefined {
  const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d+))?$/)
  if (!m) return undefined
  const [, h, mi, se, frac] = m
  return (Number(h ?? 0) * 3600) + Number(mi) * 60 + Number(se) + (frac ? Number('0.' + frac) : 0)
}

const NON_SPEECH = /^[\[(（【♪].*[\])）】♪]$|^♪+$/

/** 字幕ファイル（SRT / VTT）を解析 */
export function parseSubtitleFile(text: string): Line[] {
  const blocks = text.replace(/\r/g, '').replace(/^WEBVTT.*\n/, '').split(/\n{2,}/)
  const out: Line[] = []
  for (const b of blocks) {
    const rows = b.split('\n').filter(Boolean)
    const ti = rows.findIndex((r) => r.includes('-->'))
    if (ti < 0) continue
    const [a, z] = rows[ti].split('-->').map((x) => x.trim().split(/\s/)[0])
    const body = rows.slice(ti + 1).map((r) => r.replace(/<[^>]+>/g, '').trim()).filter(Boolean)
    if (!body.length) continue
    out.push({ t: parseClock(a), end: parseClock(z), text: body.join(' ') })
  }
  return mergeBilingual(out)
}

/**
 * 貼り付けテキストを解析。
 * - YouTube の「文字起こし」形式（時刻行と本文行が交互、または「0:12 本文」）
 * - タイムスタンプなしのテキスト
 */
export function parsePastedText(text: string): Line[] {
  const src = text.replace(/\r/g, '')
  if (/-->/.test(src)) return parseSubtitleFile(src)
  const rows = src.split('\n').map((r) => r.trim()).filter(Boolean)
  const out: Line[] = []
  let pending: number | undefined
  for (const r of rows) {
    const only = parseClock(r)
    if (only !== undefined) { pending = only; continue }
    const inline = r.match(/^\[?((?:\d+:)?\d{1,2}:\d{2})\]?\s+(.+)$/)
    if (inline) { out.push({ t: parseClock(inline[1]), text: inline[2] }); pending = undefined; continue }
    // YouTube のチャプター表記や「◯秒」読み上げ表記は除外
    if (/^\d+\s*(秒|分|時間)/.test(r) && r.length < 20) continue
    out.push({ t: pending, text: r })
    pending = undefined
  }
  return mergeBilingual(out)
}

/** 韓国語の直後に日本語訳の行が来る形式を1行にまとめる */
export function mergeBilingual(lines: Line[]): Line[] {
  const out: Line[] = []
  for (const l of lines) {
    const prev = out[out.length - 1]
    const isJa = !HANGUL.test(l.text) && KANA_KANJI.test(l.text)
    if (prev && isJa && HANGUL.test(prev.text) && !prev.ja && (l.t === undefined || l.t === prev.t)) {
      prev.ja = l.text
      continue
    }
    out.push({ ...l })
  }
  return out
}

export interface CleanOptions {
  dropFillers: boolean
}

/** 相づちだけの行（아. 네. 어. など）。目安: 句読点・空白を除いて5文字未満 */
export function isFiller(text: string): boolean {
  const core = text.replace(/[\s.,!?。、…~·ㅋㅎㅠㅜ]/g, '')
  return core.length < 5 && /^(아|어|네|음|예|응|오|와|헐|엥|으|흠|그|저|뭐|이제)+$/.test(core)
}

export function cleanLines(lines: Line[], opts: CleanOptions): Line[] {
  const out: Line[] = []
  for (const l of lines) {
    const text = l.text.replace(/\s+/g, ' ').trim()
    if (!text) continue
    if (NON_SPEECH.test(text)) continue
    if (!HANGUL.test(text)) continue
    if (opts.dropFillers && !l.star && isFiller(text)) continue
    const prev = out[out.length - 1]
    if (prev && prev.text === text) { if (l.star) prev.star = true; continue }
    out.push({ ...l, text })
  }
  return out
}

/** 長い素材を約 chunkSec 秒ごとに区切った候補 [startIdx, endIdx) */
export function suggestRanges(lines: Line[], chunkSec = 12 * 60, chunkLines = 120): [number, number][] {
  if (!lines.length) return []
  const timed = lines.every((l) => l.t !== undefined)
  const ranges: [number, number][] = []
  let start = 0
  for (let i = 1; i <= lines.length; i++) {
    const over = timed
      ? i < lines.length && lines[i].t! - lines[start].t! >= chunkSec
      : i - start >= chunkLines
    if (i === lines.length || over) { ranges.push([start, i]); start = i }
  }
  return ranges
}

export function formatClock(sec?: number): string {
  if (sec === undefined || Number.isNaN(sec)) return ''
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
