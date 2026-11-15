import { describe, expect, it } from 'vitest'
import { buildImagePrompt, extractImageReply } from './image'

describe('image', () => {
  it('プロンプトに書き起こし・解説・形式が入る', () => {
    const p = buildImagePrompt({ title: 'インスタのコメント', known: ['안녕하세요'] })
    expect(p).toContain('画像のメモ: インスタのコメント')
    expect(p).toContain('"notes"')
    expect(p).toContain('안녕하세요')
    expect(p).not.toMatch(/\n\n\n/)
  })
  it('返答から解説とカードを取り出す', () => {
    const r = extractImageReply('どうぞ\n```json\n{"text":"오늘 너무 행복했어 ㅠㅠ","ja":"今日すごく幸せだった（泣）","notes":["ㅠㅠ は泣き顔の顔文字","했어 はパンマル"],"items":[{"k":"너무 행복했어","j":"すごく幸せだった","p":"ノム ヘンボケッソ","w":[{"k":"행복했어","j":"幸せだった","p":"ヘンボケッソ","b":"행복하다"}]}]}\n```')
    expect(r.errors).toEqual([])
    expect(r.note).toEqual({ text: '오늘 너무 행복했어 ㅠㅠ', ja: '今日すごく幸せだった（泣）', notes: ['ㅠㅠ は泣き顔の顔文字', '했어 はパンマル'] })
    expect(r.items[0].w[0].b).toBe('행복하다')
  })
  it('解説がなければ note は null', () => {
    expect(extractImageReply('{"items":[{"k":"가","j":"か"}]}').note).toBeNull()
  })
})
