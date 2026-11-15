import { describe, expect, it } from 'vitest'
import { buildWordPrompt, countLearnedWords, extractWords, goalProgress, mergeWord, wordKey } from './words'

describe('words', () => {
  it('wordKey は辞書形を優先', () => {
    expect(wordKey({ k: '바빠요', b: '바쁘다' })).toBe('바쁘다')
    expect(wordKey({ k: '목소리.' })).toBe('목소리')
  })
  it('mergeWord: 新規と既存', () => {
    const a = mergeWord(undefined, { k: '바빠요', j: '', p: '', b: '바쁘다' }, { sentence: '요즘은 조금 바빠요.' }, 1)
    expect(a).toMatchObject({ base: '바쁘다', k: '바빠요', stage: 0, examples: [{ sentence: '요즘은 조금 바빠요.' }] })
    const b = mergeWord({ ...a, id: 1 }, { k: '바쁘다', j: '忙しい', p: 'パップダ' }, { sentence: '너무 바빠.' })
    expect(b).toMatchObject({ id: 1, j: '忙しい', p: 'パップダ' })
    expect(b.examples).toHaveLength(2)
    const c = mergeWord(b, { k: '바쁘다', j: '別の意味', p: '' }, { sentence: '너무 바빠.' })
    expect(c.j).toBe('忙しい')
    expect(c.examples).toHaveLength(2)
  })
  it('意味づけプロンプトと返答の取り出し', () => {
    expect(buildWordPrompt([{ k: '아시다시피', sentence: '또 여러분들이 아시다시피' }])).toContain('아시다시피（또 여러분들이 아시다시피）')
    const r = extractWords('はい\n{"items":[{"k":"아시다시피","j":"ご存じのとおり","p":"アシダシピ","b":"알다"},{"k":"x"}]}')
    expect(r.items).toEqual([{ k: '아시다시피', j: 'ご存じのとおり', p: 'アシダシピ', b: '알다' }])
    expect(r.errors).toHaveLength(1)
  })
  it('countLearnedWords は重複を数えない', () => {
    const n = countLearnedWords(
      [[{ k: '바빠요', j: '', p: '', b: '바쁘다' }, { k: '요즘', j: '', p: '' }]],
      [{ base: '바쁘다', k: '바쁘다', j: '', p: '', examples: [], createdAt: 0, due: 0, stage: 2, reps: 1 }],
    )
    expect(n).toBe(2)
  })
  it('goalProgress', () => {
    const DAY = 86400000
    const g = goalProgress(100, 1000, 14, 0, 2 * DAY + 1)
    expect(g.elapsed).toBe(2)
    expect(g.left).toBe(12)
    expect(g.expected).toBe(214) // 3日目までの目安
    expect(g.perDay).toBe(75)
  })
})
