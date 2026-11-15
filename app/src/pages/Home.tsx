import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { useSettings } from '../lib/settings'
import { dayKey, isLearned } from '../lib/srs'
import { countLearnedWords, goalProgress } from '../lib/words'
import type { StudyLog } from '../lib/types'

function streak(days: Set<string>): number {
  let n = 0
  const d = new Date()
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1) // 今日まだでも昨日まで続いていれば数える
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1) }
  return n
}

export default function Home() {
  const [settings] = useSettings()
  const data = useLiveQuery(async () => {
    const [decks, cards, sources, logs, words] = await Promise.all([
      db.decks.orderBy('createdAt').reverse().toArray(), db.cards.toArray(), db.sources.toArray(), db.logs.toArray(), db.words.toArray(),
    ])
    return { decks, cards, sources, logs, words }
  }, [])
  if (!data) return <p>読み込み中…</p>
  const { decks, cards, sources, logs, words } = data
  const now = Date.now()
  const today = logs.find((l) => l.day === dayKey())
  const srcOf = new Map(sources.map((s) => [s.id, s]))
  const learnedWords = countLearnedWords(cards.filter(isLearned).map((c) => c.w), words.filter(isLearned))
  const wordsDue = words.filter((w) => w.j && w.due <= now).length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="フレーズの復習" value={cards.filter((c) => c.due <= now).length} unit="枚" />
        <Stat label="覚えたフレーズ" value={cards.filter(isLearned).length} unit="個" />
        <Stat label="今日の学習" value={Math.round((today?.seconds ?? 0) / 60)} unit="分" />
        <Stat label="連続学習" value={streak(new Set(logs.map((l) => l.day)))} unit="日" />
      </div>

      <Goal learned={learnedWords} goal={settings.goalWords} days={settings.goalDays} start={settings.goalStart} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Week logs={logs} />
        <Link to="/words" className="card flex items-center gap-3 hover:border-rose-300">
          <div className="flex-1">
            <p className="text-xs text-stone-500">単語デッキ</p>
            <p className="text-2xl font-bold">{words.length}<span className="ml-0.5 text-sm font-normal text-stone-500">語</span></p>
            <p className="text-xs text-stone-500">覚えた {words.filter(isLearned).length} · 意味なし {words.filter((w) => !w.j).length}</p>
          </div>
          <span className={wordsDue ? 'btn-primary' : 'btn-ghost'}>{wordsDue ? `暗記 ${wordsDue}` : '開く'}</span>
        </Link>
      </div>

      <div className="flex items-center">
        <h1 className="text-xl font-bold">デッキ</h1>
        <Link to="/import?mode=image" className="btn-ghost ml-auto">🖼️ 画像から</Link>
        <Link to="/import" className="btn-primary ml-2">＋ 字幕を取り込む</Link>
      </div>

      {decks.length === 0 && (
        <div className="card space-y-2 text-sm">
          <p className="font-semibold">はじめかた</p>
          <ol className="list-decimal space-y-1 pl-5 text-stone-600 dark:text-stone-400">
            <li>YouTube で好きな韓国語の動画を見つける（tblfan は拡張から送れます）</li>
            <li>概要欄の「文字起こしを表示」から字幕をコピー</li>
            <li>「字幕を取り込む」に貼り付けて、使う範囲を選ぶ</li>
            <li>プロンプトを claude.ai に貼って、返ってきた答えを貼り戻す</li>
          </ol>
        </div>
      )}

      <ul className="space-y-2">
        {decks.map((d) => {
          const cs = cards.filter((c) => c.deckId === d.id)
          const due = cs.filter((c) => c.due <= now).length
          const s = srcOf.get(d.sourceId)
          return (
            <li key={d.id} className="card flex items-center gap-3">
              <Link to={`/deck/${d.id}`} className="min-w-0 flex-1">
                <p className="truncate font-semibold ko">{d.title}</p>
                <p className="text-xs text-stone-500">
                  {s?.kind === 'live' ? 'ライブ' : s?.kind === 'youtube' ? 'YouTube' : s?.kind === 'image' ? '画像' : 'その他'}
                  {s?.artist && ` · ${s.artist}`} · {cs.length} 枚 · 覚えた {cs.filter(isLearned).length}
                </p>
              </Link>
              {cs.length === 0
                ? <Link to={`/deck/${d.id}/make`} className="btn-ghost">カードを作る</Link>
                : <Link to={`/study/${d.id}`} className={due ? 'btn-primary' : 'btn-ghost'}>{due ? `暗記 ${due}` : '済'}</Link>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Goal({ learned, goal, days, start }: { learned: number; goal: number; days: number; start: number }) {
  if (!start) {
    return (
      <div className="card flex items-center gap-3 text-sm">
        <p className="flex-1">目標（例: {days}日で{goal}語）を決めると、毎日の目安が出ます。</p>
        <Link to="/settings" className="btn-ghost">目標を決める</Link>
      </div>
    )
  }
  const g = goalProgress(learned, goal, days, start)
  const finished = g.left === 0
  return (
    <div className="card space-y-2">
      <div className="flex items-baseline gap-2">
        <p className="text-xs text-stone-500">目標: {days}日で{goal}語</p>
        <p className="ml-auto text-xs text-stone-500">{finished ? '期間終了' : `${g.elapsed + 1}日目 · 残り${g.left}日`}</p>
      </div>
      <p className="text-2xl font-bold">
        {learned}<span className="text-sm font-normal text-stone-500"> / {goal} 語</span>
      </p>
      <div className="relative h-3 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
        <div className="h-full rounded-full bg-rose-600" style={{ width: `${g.ratio * 100}%` }} />
        <div className="absolute top-0 h-full w-0.5 bg-stone-900/60 dark:bg-white/70" style={{ left: `${Math.min(100, (g.expected / goal) * 100)}%` }} title={`今日までの目安 ${g.expected}語`} />
      </div>
      <p className="text-sm">
        {learned >= goal
          ? '🎉 目標達成！'
          : finished
            ? `あと ${goal - learned} 語。期間を延ばすか、新しい目標を決めましょう`
            : <>今日までの目安 {g.expected} 語 · {g.ahead >= 0 ? <span className="text-emerald-700 dark:text-emerald-400">{g.ahead} 語リード</span> : <span className="text-amber-700 dark:text-amber-400">{-g.ahead} 語おくれ</span>} · 1日あと <b>{g.perDay}</b> 語ペース</>}
      </p>
    </div>
  )
}

function Week({ logs }: { logs: StudyLog[] }) {
  const byDay = new Map(logs.map((l) => [l.day, l]))
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const l = byDay.get(dayKey(d))
    return { label: '日月火水木金土'[d.getDay()], min: Math.round((l?.seconds ?? 0) / 60) }
  })
  const max = Math.max(30, ...days.map((d) => d.min))
  const total = days.reduce((a, d) => a + d.min, 0)
  return (
    <div className="card">
      <div className="flex items-baseline">
        <p className="text-xs text-stone-500">この7日の学習</p>
        <p className="ml-auto text-xs text-stone-500">合計 {total} 分</p>
      </div>
      <div className="mt-2 flex h-20 items-end gap-1.5">
        {days.map((d, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full rounded-t bg-rose-600/80" style={{ height: `${(d.min / max) * 56}px`, minHeight: d.min ? 2 : 0 }} title={`${d.min}分`} />
            <span className={`text-[10px] ${i === 6 ? 'font-bold' : 'text-stone-500'}`}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="card py-3">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="text-2xl font-bold">{value}<span className="ml-0.5 text-sm font-normal text-stone-500">{unit}</span></p>
    </div>
  )
}
