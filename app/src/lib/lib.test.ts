import { describe, expect, it } from 'vitest'
import { cleanLines, isFiller, parseClock, parsePastedText, parseSubtitleFile, suggestRanges } from './parse'
import { extractItems, findJson } from './extract'
import { buildPrompts } from './prompt'
import { nextReview, requeue } from './srs'

describe('parseClock', () => {
  it('parses m:ss / h:mm:ss / srt times', () => {
    expect(parseClock('0:12')).toBe(12)
    expect(parseClock('1:02:03')).toBe(3723)
    expect(parseClock('00:01:02,500')).toBe(62.5)
    expect(parseClock('안녕')).toBeUndefined()
  })
})

describe('parsePastedText', () => {
  it('YouTube 文字起こし（時刻行と本文行が交互）', () => {
    const text = '0:03\n안녕하세요 여러분\n0:07\n오늘은 카페에 왔어요\n'
    expect(parsePastedText(text)).toEqual([
      { t: 3, text: '안녕하세요 여러분' },
      { t: 7, text: '오늘은 카페에 왔어요' },
    ])
  })
  it('インライン時刻', () => {
    expect(parsePastedText('[1:05] 진짜 맛있다')).toEqual([{ t: 65, text: '진짜 맛있다' }])
  })
  it('タイムスタンプなし', () => {
    expect(parsePastedText('밥 먹었어요?\n네 먹었어요')).toEqual([{ text: '밥 먹었어요?' }, { text: '네 먹었어요' }])
  })
  it('韓日交互テキストを1行にまとめる', () => {
    const out = parsePastedText('0:01\n목소리 잘 들려요?\n声、聞こえますか？\n0:05\n요즘은 조금 바빠요\n最近は少し忙しいです')
    expect(out).toEqual([
      { t: 1, text: '목소리 잘 들려요?', ja: '声、聞こえますか？' },
      { t: 5, text: '요즘은 조금 바빠요', ja: '最近は少し忙しいです' },
    ])
  })
})

describe('parseSubtitleFile', () => {
  it('SRT', () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,500\n안녕하세요\n\n2\n00:00:03,000 --> 00:00:04,000\n<i>반가워요</i>\n'
    expect(parseSubtitleFile(srt)).toEqual([
      { t: 1, end: 2.5, text: '안녕하세요' },
      { t: 3, end: 4, text: '반가워요' },
    ])
  })
  it('VTT', () => {
    const vtt = 'WEBVTT\n\n00:01.000 --> 00:02.000\n고마워요\n'
    expect(parseSubtitleFile(vtt)).toEqual([{ t: 1, end: 2, text: '고마워요' }])
  })
})

describe('cleanLines', () => {
  it('相づち・非発話・重複・韓国語なしを除く（★は残す）', () => {
    const out = cleanLines(
      [
        { text: '[음악]' },
        { text: '아. 네.' },
        { text: '네.', star: true },
        { text: '오늘 날씨 좋다' },
        { text: '오늘 날씨 좋다' },
        { text: 'OK' },
      ],
      { dropFillers: true },
    )
    expect(out.map((l) => l.text)).toEqual(['네.', '오늘 날씨 좋다'])
  })
  it('括弧つきのナレーション字幕は括弧を外して残す', () => {
    const out = cleanLines([{ text: '[크리스마스 다음 날인데도 부지런한 분들이 많아요]' }, { text: '(웃음)' }, { text: '[박수]' }, { text: '♪♪' }], { dropFillers: true })
    expect(out.map((l) => l.text)).toEqual(['크리스마스 다음 날인데도 부지런한 분들이 많아요'])
  })
  it('isFiller', () => {
    expect(isFiller('아.')).toBe(true)
    expect(isFiller('어. 네.')).toBe(true)
    expect(isFiller('네 먹었어요')).toBe(false)
  })
})

describe('suggestRanges', () => {
  it('時刻ありは約12分ごと', () => {
    const lines = Array.from({ length: 50 }, (_, i) => ({ t: i * 60, text: '가' }))
    expect(suggestRanges(lines)).toEqual([[0, 12], [12, 24], [24, 36], [36, 48], [48, 50]])
  })
})

describe('extract', () => {
  it('前後の文章とコードブロックを無視', () => {
    const reply = 'はい、作りました！\n```json\n{"items":[{"k":"목소리 잘 들려요?","j":"声聞こえますか？","p":"モクソリ チャル トゥルリョヨ","t":118,"w":[{"k":"목소리","j":"声","p":"モクソリ"}]}]}\n```\n他にも…'
    const r = extractItems(reply)
    expect(r.errors).toEqual([])
    expect(r.items[0]).toMatchObject({ k: '목소리 잘 들려요?', t: 118 })
    expect(r.items[0].w[0].k).toBe('목소리')
  })
  it('文字列中の括弧に惑わされない', () => {
    expect(findJson('x {"a":"}{"} y')).toBe('{"a":"}{"}')
  })
  it('壊れた項目だけ報告', () => {
    const r = extractItems('{"items":[{"k":"가"},{"k":"나","j":"な"}]}')
    expect(r.items).toHaveLength(1)
    expect(r.errors[0]).toContain('1件目')
  })
  it('途中で切れた JSON', () => {
    expect(extractItems('{"items":[{"k":"가"').errors[0]).toContain('JSON')
  })
})

describe('buildPrompts', () => {
  it('60行ごとにパート分割し、★と参考訳を含める', () => {
    const lines = Array.from({ length: 130 }, (_, i) => ({ t: i, text: `문장 ${i}`, ja: i === 0 ? '文' : undefined, star: i === 1 }))
    const parts = buildPrompts(lines, { title: 'ライブ', kind: 'live' })
    expect(parts).toHaveLength(3)
    expect(parts[0]).toContain('パート1/3')
    expect(parts[0]).toContain('★[0:01|1s] 문장 1')
    expect(parts[0]).toContain('訳: 文')
    expect(parts[0]).toContain('ライブならでは')
    expect(parts[1]).not.toContain('★印の行')
  })
})

describe('srs', () => {
  const fresh = { due: 0, stage: 0, reps: 0 }
  it('again は今すぐ・段階を下げる', () => {
    expect(nextReview({ ...fresh, stage: 2 }, 'again', 1000)).toMatchObject({ stage: 1, due: 1000 })
  })
  it('ok は初回1日後、以降は据え置き', () => {
    expect(nextReview(fresh, 'ok', 0).stage).toBe(1)
    expect(nextReview({ ...fresh, stage: 3 }, 'ok', 0).stage).toBe(3)
  })
  it('good は初回3日後', () => {
    const r = nextReview(fresh, 'good', 0)
    expect(r.stage).toBe(2)
    expect(r.due).toBe(3 * 86400000)
  })
  it('requeue: again は数枚後に再出題', () => {
    expect(requeue(['a', 'b', 'c', 'd', 'e', 'f'], 'a', 'again')).toEqual(['b', 'c', 'd', 'e', 'a', 'f'])
    expect(requeue(['a', 'b'], 'a', 'good')).toEqual(['b'])
  })
})
