import type { Line } from './types'

export interface ReplayRecord {
  replayId: string
  title: string
  url: string
  artist?: string
  lines: { t: number; end?: number; ko: string; ja?: string; star?: boolean }[]
  /** 拡張で「＋単語を保存」した単語 */
  words?: { ko: string; base?: string; ja?: string; sentence?: string; t?: number }[]
}

/** tblfan 拡張に記録を頼んで受け取る（拡張が入っていなければ null） */
export function requestReplay(replayId: string, timeoutMs = 4000): Promise<ReplayRecord | null> {
  return new Promise((resolve) => {
    let done = false
    const finish = (v: ReplayRecord | null) => {
      if (done) return
      done = true
      window.removeEventListener('message', onMsg)
      clearInterval(timer)
      resolve(v)
    }
    const onMsg = (e: MessageEvent) => {
      const m = e.data
      if (e.source !== window || m?.source !== 'tbl-dual-subs-ext') return
      if (m.type === 'ready') ask()
      if (m.type === 'replay' && m.replayId === replayId) finish(m.data)
    }
    const ask = () => window.postMessage({ source: 'phrase-app', type: 'request-replay', replayId }, location.origin)
    window.addEventListener('message', onMsg)
    const timer = setInterval(ask, 500)
    ask()
    setTimeout(() => finish(null), timeoutMs)
  })
}

export function replayToLines(r: ReplayRecord): Line[] {
  return r.lines.map((l) => ({ t: l.t, end: l.end, text: l.ko, ja: l.ja || undefined, star: l.star || undefined }))
}

/** "allday-project_day-off" → "allday-project" のような表示用アーティスト名 */
export function artistFromSlug(slug?: string): string {
  return (slug || '').split('_')[0]
}
