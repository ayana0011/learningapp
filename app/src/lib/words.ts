import type { Word, WordCard, WordExample } from './types'
import { findJson } from './extract'

/** 単語をまとめるキー（辞書形があればそれ、なければ表記） */
export function wordKey(w: { k: string; b?: string; base?: string }): string {
  return (w.b || w.base || w.k).replace(/[^가-힣a-zA-Z0-9]/g, '')
}

/**
 * 既存の単語カードに新しい単語を合わせる。
 * 同じ辞書形があれば例文を足し、意味・発音が空なら埋める。なければ新しいカードを返す。
 */
export function mergeWord(existing: WordCard | undefined, w: Word, example?: WordExample, now = Date.now()): WordCard {
  const ex = example && example.sentence ? [example] : []
  if (!existing) {
    return { base: wordKey(w), k: w.k, j: w.j || '', p: w.p || '', examples: ex, createdAt: now, due: 0, stage: 0, reps: 0 }
  }
  const examples = [...existing.examples]
  for (const e of ex) if (!examples.some((x) => x.sentence === e.sentence)) examples.push(e)
  return { ...existing, j: existing.j || w.j || '', p: existing.p || w.p || '', examples: examples.slice(-5) }
}

/** 意味がまだない単語の意味をまとめて作るプロンプト */
export function buildWordPrompt(words: { k: string; sentence?: string }[]): string {
  return [
    '韓国語の単語の意味を日本語で付けてください。JSONだけを返してください（前置き・説明・コードブロック記号は不要）。',
    '- k: 単語（そのまま）, j: 例文の中での意味（短く）, p: カタカナ発音, b: 辞書形（例: 바빠요→바쁘다、시상식들도→시상식）',
    '- 助詞や語尾が付いたままの単語は、b に辞書形を入れる',
    '',
    '# 出力形式',
    '{"items":[{"k":"単語","j":"意味","p":"カタカナ","b":"辞書形"}]}',
    '',
    '# 単語（例文）',
    ...words.map((w) => `${w.k}${w.sentence ? `（${w.sentence}）` : ''}`),
  ].join('\n')
}

export interface WordReply {
  items: Word[]
  errors: string[]
}

export function extractWords(text: string): WordReply {
  const raw = findJson(text)
  if (!raw) return { items: [], errors: ['JSON が見つかりませんでした。返答をまるごと貼り付けてください。'] }
  let data: unknown
  try { data = JSON.parse(raw) } catch (e) {
    return { items: [], errors: [`JSON の形が壊れています（${(e as Error).message}）`] }
  }
  const list = Array.isArray(data) ? data : (data as Record<string, unknown>)?.items
  if (!Array.isArray(list)) return { items: [], errors: ['"items" の一覧が見つかりませんでした。'] }
  const items: Word[] = []
  const errors: string[] = []
  list.forEach((v, i) => {
    const o = (v ?? {}) as Record<string, unknown>
    const s = (x: unknown) => (typeof x === 'string' ? x.trim() : '')
    const k = s(o.k), j = s(o.j)
    if (!k || !j) { errors.push(`${i + 1}件目: 単語(k)か意味(j)がありません`); return }
    items.push({ k, j, p: s(o.p), b: s(o.b) || undefined })
  })
  return { items, errors }
}

/**
 * 覚えた単語の数（重複なし）。
 * 単語デッキで覚えた単語 ＋ 覚えたフレーズに入っている単語。
 */
export function countLearnedWords(learnedPhraseWords: Word[][], learnedWordCards: WordCard[]): number {
  const set = new Set<string>()
  for (const ws of learnedPhraseWords) for (const w of ws) set.add(wordKey(w))
  for (const c of learnedWordCards) set.add(c.base)
  set.delete('')
  return set.size
}

/** 目標の進み具合 */
export function goalProgress(learned: number, goal: number, days: number, start: number, now = Date.now()) {
  const DAY = 86400000
  const elapsed = Math.max(0, Math.floor((now - start) / DAY))
  const left = Math.max(0, days - elapsed)
  const expected = Math.min(goal, Math.round((goal * Math.min(days, elapsed + 1)) / days))
  const perDay = left > 0 ? Math.ceil(Math.max(0, goal - learned) / left) : Math.max(0, goal - learned)
  return { elapsed, left, expected, perDay, ratio: goal ? Math.min(1, learned / goal) : 0, ahead: learned - expected }
}
