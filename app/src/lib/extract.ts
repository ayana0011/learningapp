import type { GeneratedItem, Word } from './types'

export interface ExtractResult {
  items: GeneratedItem[]
  errors: string[]
}

/** 文字列から最初の JSON オブジェクト／配列を取り出す（前後の文章や ```json 囲みを無視） */
export function findJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const src = fenced ? fenced[1] : text
  const start = src.search(/[{[]/)
  if (start < 0) return null
  const open = src[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < src.length; i++) {
    const c = src[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === open) depth++
    else if (c === close && --depth === 0) return src.slice(start, i + 1)
  }
  return null
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

function toWord(v: unknown): Word | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const k = str(o.k ?? o.korean)
  if (!k) return null
  return { k, j: str(o.j ?? o.japanese), p: str(o.p ?? o.katakana), b: str(o.b ?? o.base_form) || undefined }
}

/** AI の返答を検証して GeneratedItem[] にする。壊れた項目はエラーとして報告し、使える項目は残す */
export function extractItems(text: string): ExtractResult {
  const errors: string[] = []
  const raw = findJson(text)
  if (!raw) return { items: [], errors: ['JSON が見つかりませんでした。返答をまるごと貼り付けてください。'] }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (e) {
    const msg = (e as Error).message
    return { items: [], errors: [`JSON の形が壊れています（${msg}）。返答が途中で切れていないか確認してください。`] }
  }
  const list = Array.isArray(data) ? data : (data as Record<string, unknown>)?.items
  if (!Array.isArray(list)) return { items: [], errors: ['"items" の一覧が見つかりませんでした。'] }

  const items: GeneratedItem[] = []
  list.forEach((v, i) => {
    const o = (v ?? {}) as Record<string, unknown>
    const k = str(o.k ?? o.korean)
    const j = str(o.j ?? o.japanese)
    if (!k || !j) { errors.push(`${i + 1}件目: 韓国語(k)か日本語(j)がありません`); return }
    const t = typeof o.t === 'number' ? o.t : typeof o.timestamp === 'number' ? o.timestamp : undefined
    const ws = Array.isArray(o.w ?? o.words) ? ((o.w ?? o.words) as unknown[]).map(toWord).filter((w): w is Word => !!w) : []
    items.push({ k, j, p: str(o.p ?? o.katakana), t, w: ws })
  })
  return { items, errors }
}
