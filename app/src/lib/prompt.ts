import type { Line, SourceKind } from './types'
import { formatClock } from './parse'

export const PART_MAX_LINES = 60

export interface PromptMeta {
  title: string
  kind: SourceKind
  artist?: string
  /** 既に覚えた韓国語フレーズ（重複を避けるため） */
  known?: string[]
}

const FORMAT = `{"items":[{"k":"韓国語","j":"日本語訳","p":"カタカナ発音","t":秒数,"w":[{"k":"単語","j":"意味","p":"カタカナ","b":"辞書形"}]}]}`

function rules(meta: PromptMeta, hasJa: boolean, hasStar: boolean): string {
  const live = meta.kind === 'live'
  const r = [
    '韓国語学習用の暗記カードを作ってください。以下の字幕から、日本語話者が覚えると役立つフレーズを選び、JSONだけを返してください（前置き・説明・コードブロック記号は不要）。',
    '',
    '# 作り方',
    '- 1カード＝意味のまとまった1文。40文字を超える文は意味の切れ目で2〜3枚に分ける',
    '- 除外: 相づちだけの文（아./네./어. など）、歌詞・BGM部分、同じ決まり文句の2回目以降',
  ]
  if (hasStar) r.push('- ★印の行は本人が覚えたいと選んだ文。必ずカードにする')
  r.push(
    `- 優先順: ${hasStar ? '★印 → ' : ''}${live ? 'ライブならではで自分も使える表現 → ' : '日常会話でそのまま使える表現 → '}頻出語を含み真似しやすい短い文`,
    '- 量: このパートから最大30枚',
    '- 字幕は自動認識なので誤字・聞き間違いがある前提で、文脈から正しい韓国語に直してから使う',
  )
  if (hasJa) r.push('- 「訳:」は自動翻訳の参考訳。誤訳が多いので、必ず韓国語から自然な日本語に訳し直す')
  r.push(
    '- p: 実際の発音（連音化・濃音化・鼻音化など）を反映したカタカナ。単語の区切りに半角スペース',
    '- w: その文の内容語（名詞・動詞・形容詞・副詞・よく使う表現）。助詞だけのものは入れない。b は辞書形（例: 해볼게요→해보다）',
    '- t: その文が始まる行の秒数（行頭の[時刻]から。なければ省略）',
  )
  if (meta.known?.length) r.push(`- 次の文は既に覚えているので入れない: ${meta.known.slice(0, 40).join(' / ')}`)
  r.push('', '# 出力形式（項目名は短いまま）', FORMAT)
  return r.join('\n')
}

function lineToText(l: Line): string {
  const time = l.t !== undefined ? `[${formatClock(l.t)}|${Math.round(l.t)}s] ` : ''
  const star = l.star ? '★' : ''
  const ja = l.ja ? `\n  訳: ${l.ja}` : ''
  return `${star}${time}${l.text}${ja}`
}

/** 選んだ範囲の字幕から、claude.ai に貼るプロンプトを作る（長い場合はパート分割） */
export function buildPrompts(lines: Line[], meta: PromptMeta, maxLines = PART_MAX_LINES): string[] {
  const parts: Line[][] = []
  for (let i = 0; i < lines.length; i += maxLines) parts.push(lines.slice(i, i + maxLines))
  return parts.map((part, i) => {
    const hasJa = part.some((l) => l.ja)
    const hasStar = part.some((l) => l.star)
    const head = [
      `素材: ${meta.title}${meta.artist ? `（${meta.artist}）` : ''}${parts.length > 1 ? ` パート${i + 1}/${parts.length}` : ''}`,
    ]
    return [rules(meta, hasJa, hasStar), '', '# 字幕', ...head, ...part.map(lineToText)].join('\n')
  })
}
