import { useEffect, useState } from 'react'
import { blobToDataUrl } from './image'

/** パソコンで動く「お手伝いプログラム」（helper/server.mjs）。Claude Code でカードを自動作成する */
const BASE = 'http://127.0.0.1:8787'

export async function helperAvailable(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1500) })
    return r.ok && (await r.json()).ok === true
  } catch {
    return false
  }
}

/** お手伝いプログラムが動いているか（ページに戻ってきたときにも確認し直す） */
export function useHelper(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => {
    // スマホからは使えないので確認もしない
    if (/iPhone|iPad|Android/i.test(navigator.userAgent)) { setOk(false); return }
    let alive = true
    const check = () => helperAvailable().then((v) => alive && setOk(v))
    check()
    window.addEventListener('focus', check)
    return () => { alive = false; window.removeEventListener('focus', check) }
  }, [])
  return ok
}

/** Claude Code にプロンプト（と画像）を渡して答えの文章を受け取る */
export async function helperGenerate(prompt: string, image?: Blob): Promise<string> {
  const body: { prompt: string; image?: string } = { prompt }
  if (image) body.image = await blobToDataUrl(image)
  let r: Response
  try {
    r = await fetch(`${BASE}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new Error('お手伝いプログラムにつながりません。ターミナルで起動しているか確認してください')
  }
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `エラー (${r.status})`)
  return String(data.text || '')
}

export const HELPER_COMMAND = 'node ~/learningapp/helper/server.mjs'

export interface YoutubeSubs {
  id: string
  url: string
  title?: string
  author?: string
  lang: string
  generated: boolean
  lines: { t: number; end: number; text: string }[]
}

/** YouTube の韓国語字幕を取ってくる（お手伝いプログラム経由） */
export async function helperYoutube(url: string): Promise<YoutubeSubs> {
  let r: Response
  try {
    r = await fetch(`${BASE}/youtube`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
  } catch {
    throw new Error('お手伝いプログラムにつながりません。ターミナルで起動しているか確認してください')
  }
  const data = await r.json().catch(() => ({}))
  if (r.status === 404) throw new Error('お手伝いプログラムが古いので、ターミナルで止めて（Ctrl+C）もう一度起動してください')
  if (!r.ok) throw new Error(data.error || `エラー (${r.status})`)
  return data as YoutubeSubs
}

export function isYoutubeUrl(url: string): boolean {
  return /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch|shorts|live)|youtu\.be\/)/.test(url.trim())
}
