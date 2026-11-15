import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { logStudy } from '../db/db'
import { isLearned, nextReview, requeue } from '../lib/srs'
import { speakKo, useSettings } from '../lib/settings'
import type { Grade, Review } from '../lib/types'

export interface StudyItem extends Review {
  id?: number
  k: string
  j: string
}

interface Props<T extends StudyItem> {
  title: string
  backTo: string
  /** 出題するカード（期限が来たもの）を読み込む */
  load: () => Promise<T[]>
  save: (item: T, review: Review) => Promise<unknown>
  /** 裏面の追加情報（発音・単語・例文など） */
  renderBack: (item: T) => ReactNode
  /** 下のボタン列に足すもの */
  renderActions?: (item: T) => ReactNode
  doneExtra?: ReactNode
}

/** フレーズ・単語共通の暗記画面 */
export default function StudySession<T extends StudyItem>({ title, backTo, load, save, renderBack, renderActions, doneExtra }: Props<T>) {
  const [settings, setSettings] = useSettings()
  const [queue, setQueue] = useState<T[] | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [done, setDone] = useState(0)
  const started = useRef(Date.now())
  const stats = useRef({ reviewed: 0, learned: 0, saved: 0 })

  useEffect(() => {
    load().then((all) => {
      const review = all.filter((c) => c.reps > 0)
      const fresh = all.filter((c) => c.reps === 0).slice(0, settings.newPerSession)
      setQueue([...review, ...fresh])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ページを離れるときに学習時間を記録
  useEffect(() => {
    const flush = () => {
      const sec = Math.round((Date.now() - started.current) / 1000) - stats.current.saved
      if (sec > 5 || stats.current.reviewed) logStudy(sec, stats.current.reviewed, stats.current.learned)
      stats.current = { reviewed: 0, learned: 0, saved: stats.current.saved + sec }
    }
    window.addEventListener('pagehide', flush)
    return () => { window.removeEventListener('pagehide', flush); flush() }
  }, [])

  const card = queue?.[0]

  const busy = useRef(false)
  async function grade(g: Grade) {
    if (!card || !queue || busy.current) return
    busy.current = true
    const next = nextReview(card, g)
    try { await save(card, next) } finally { busy.current = false }
    stats.current.reviewed++
    if (!isLearned(card) && isLearned(next)) stats.current.learned++
    const updated = { ...card, ...next }
    setQueue(requeue(queue.map((c) => (c === card ? updated : c)), updated, g))
    if (g !== 'again') setDone((d) => d + 1)
    setFlipped(false)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card || busy.current) return
      const el = document.activeElement
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped((f) => !f) }
      if (!flipped) return
      if (e.key === '1') grade('again')
      if (e.key === '2') grade('ok')
      if (e.key === '3') grade('good')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!queue) return <p>読み込み中…</p>

  if (!card) {
    const min = Math.round((Date.now() - started.current) / 60000)
    return (
      <div className="card space-y-3 text-center">
        <p className="text-4xl">🎉</p>
        <p className="font-bold">{done ? `${done} 枚おわり！（約 ${min} 分）` : '今日の分はありません'}</p>
        {doneExtra}
        <Link to={backTo} className="btn-ghost">戻る</Link>
      </div>
    )
  }

  const front = settings.front === 'ja'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <Link to={backTo} className="text-stone-500">← {title}</Link>
        <span className="ml-auto text-stone-500">残り {queue.length} · 済 {done}</span>
        <button className="btn-ghost px-2 py-1" onClick={() => setSettings({ front: front ? 'ko' : 'ja' })}>表: {front ? '日本語' : '韓国語'}</button>
      </div>

      <div role="button" tabIndex={0} onClick={() => setFlipped((f) => !f)} className="card flex min-h-64 w-full cursor-pointer flex-col items-center justify-center gap-3 text-center">
        {front ? <p className="text-xl">{card.j || '（意味なし）'}</p> : <p className="ko text-3xl font-bold">{card.k}</p>}
        {!flipped && <p className="text-xs text-stone-400">タップ／スペースで答え</p>}
        {flipped && (
          <div className="w-full space-y-3 border-t border-stone-200 pt-4 dark:border-stone-800">
            {front ? <p className="ko text-3xl font-bold">{card.k}</p> : <p className="text-xl">{card.j}</p>}
            {renderBack(card)}
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-3 text-sm">
        <button className="btn-ghost" onClick={() => speakKo(card.k)}>🔊 読み上げ</button>
        {renderActions?.(card)}
      </div>

      {flipped && (
        <div className="grid grid-cols-3 gap-2">
          <button className="btn bg-stone-200 py-4 dark:bg-stone-800" onClick={() => grade('again')}>もう一回<span className="text-xs opacity-60">1</span></button>
          <button className="btn bg-amber-200 py-4 text-amber-950" onClick={() => grade('ok')}>だいたいOK<span className="text-xs opacity-60">2</span></button>
          <button className="btn bg-emerald-600 py-4 text-white" onClick={() => grade('good')}>覚えた<span className="text-xs opacity-60">3</span></button>
        </div>
      )}
    </div>
  )
}
