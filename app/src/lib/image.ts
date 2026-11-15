import { extractItems, findJson } from './extract'
import type { GeneratedItem, ImageNote } from './types'

/** 画像の韓国語を書き起こし・解説・カード化してもらうプロンプト（画像は claude.ai に一緒に貼る） */
export function buildImagePrompt(opts: { title?: string; known?: string[] } = {}): string {
  const r = [
    '添付した画像に写っている韓国語を、日本語話者の学習者向けに解説し、暗記カードを作ってください。JSONだけを返してください（前置き・説明・コードブロック記号は不要）。',
    opts.title ? `画像のメモ: ${opts.title}` : '',
    '',
    '# やること',
    '1. text: 画像の韓国語をそのまま書き起こす（改行は \\n。韓国語以外の部分は省く）',
    '2. ja: 全体の自然な日本語訳',
    '3. notes: 学習者がつまずきそうな点の解説を3〜8個（文法・活用・略語・スラング・ネット用語・敬語のレベル・背景など。1項目1〜2文、日本語で）',
    '4. items: 覚えると役立つフレーズのカード（最大20枚）。1カード＝意味のまとまった短い文',
    '   - p: 実際の発音を反映したカタカナ（単語の区切りに半角スペース）',
    '   - w: その文の内容語。助詞だけのものは入れない。b は辞書形（例: 바빠요→바쁘다）',
    '- 文字が読みにくい・切れている部分は文脈から推定し、notes にその旨を書く',
  ]
  if (opts.known?.length) r.push(`- 次の文は既に覚えているのでカードにしない: ${opts.known.slice(0, 40).join(' / ')}`)
  r.push(
    '',
    '# 出力形式（項目名は短いまま）',
    '{"text":"画像の韓国語","ja":"全体の訳","notes":["解説"],"items":[{"k":"韓国語","j":"日本語訳","p":"カタカナ発音","w":[{"k":"単語","j":"意味","p":"カタカナ","b":"辞書形"}]}]}',
  )
  return r.filter((x, i) => x !== '' || r[i - 1] !== '').join('\n')
}

export interface ImageReply {
  items: GeneratedItem[]
  errors: string[]
  note: ImageNote | null
}

export function extractImageReply(text: string): ImageReply {
  const base = extractItems(text)
  const raw = findJson(text)
  let note: ImageNote | null = null
  if (raw) {
    try {
      const o = JSON.parse(raw) as Record<string, unknown>
      const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
      const notes = Array.isArray(o.notes) ? o.notes.map(s).filter(Boolean) : []
      if (s(o.text) || s(o.ja) || notes.length) note = { text: s(o.text), ja: s(o.ja), notes }
    } catch { /* extractItems がエラーを報告済み */ }
  }
  return { ...base, note }
}

/** 画像を長辺 maxSide まで縮小した JPEG にする（保存容量を抑える） */
export async function shrinkImage(file: Blob, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('画像を変換できませんでした'))), 'image/jpeg', quality))
}

/**
 * クリップボードに画像をコピー（ブラウザは PNG しか受け付けないので変換する）。
 * クリックの直後に write を呼ばないと拒否されるので、変換は Promise のまま渡す。
 */
export function copyImage(blob: Blob): Promise<void> {
  const png = (async () => {
    const bmp = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bmp.width
    canvas.height = bmp.height
    canvas.getContext('2d')!.drawImage(bmp, 0, 0)
    bmp.close()
    return new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('変換できませんでした'))), 'image/png'))
  })()
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
}

export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = () => rej(r.error)
    r.readAsDataURL(b)
  })
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob()
}
