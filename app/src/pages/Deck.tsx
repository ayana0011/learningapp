import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/db'
import WordChips from '../components/WordChips'
import NoteView from '../components/NoteView'
import { useEffect } from 'react'
import { formatClock } from '../lib/parse'
import { isLearned } from '../lib/srs'
import { speakKo, youtubeAt } from '../lib/settings'
import type { PhraseCard } from '../lib/types'

export default function DeckPage() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const deck = useLiveQuery(() => db.decks.get(id), [id])
  const source = useLiveQuery(() => (deck ? db.sources.get(deck.sourceId) : undefined), [deck])
  const cards = useLiveQuery(() => db.cards.where('deckId').equals(id).sortBy('order'), [id])
  const [editing, setEditing] = useState<number | null>(null)

  if (!deck || !cards) return <p>読み込み中…</p>
  const now = Date.now()
  const due = cards.filter((c) => c.due <= now).length

  async function move(i: number, d: -1 | 1) {
    const a = cards![i], b = cards![i + d]
    if (!a || !b) return
    await db.transaction('rw', db.cards, async () => {
      await db.cards.update(a.id!, { order: b.order })
      await db.cards.update(b.id!, { order: a.order })
    })
  }

  async function removeDeck() {
    if (!confirm(`「${deck!.title}」とカード ${cards!.length} 枚を削除します。元に戻せません。`)) return
    await db.cards.where('deckId').equals(id).delete()
    await db.decks.delete(id)
    nav('/')
  }

  return (
    <div className="space-y-5">
      <div>
        <Link to="/" className="text-sm text-stone-500">← ホーム</Link>
        <h1 className="text-xl font-bold ko">{deck.title}</h1>
        <p className="text-sm text-stone-500">
          {source?.artist && `${source.artist} · `}{cards.length} 枚 · 覚えた {cards.filter(isLearned).length} 枚
          {source?.url && <> · <a className="underline" href={source.url} target="_blank" rel="noreferrer">元の動画</a></>}
        </p>
      </div>
      {source?.image && <DeckImage blob={source.image} />}
      {source?.note && <NoteView note={source.note} open={false} />}

      <div className="flex flex-wrap gap-2">
        <Link to={`/study/${id}`} className={`btn-primary ${cards.length ? '' : 'pointer-events-none opacity-40'}`}>暗記する（{due} 枚）</Link>
        <Link to={`/deck/${id}/make`} className="btn-ghost">カードを作る・追加する</Link>
        <button onClick={removeDeck} className="btn-ghost ml-auto text-rose-600">デッキを削除</button>
      </div>

      {cards.length === 0 && <p className="card text-sm text-stone-500">まだカードがありません。「カードを作る」から追加してください。</p>}

      <ul className="space-y-2">
        {cards.map((c, i) =>
          editing === c.id ? (
            <EditRow key={c.id} card={c} onDone={() => setEditing(null)} />
          ) : (
            <li key={c.id} className="card flex gap-3">
              <div className="min-w-0 flex-1">
                <p className="ko text-lg font-semibold">{c.k}</p>
                <p className="text-sm text-stone-500">{c.p}</p>
                <p className="text-sm">{c.j}</p>
                {c.w.length > 0 && <div className="mt-2 [&_ul]:justify-start [&_ul]:max-w-none"><WordChips words={c.w} sentence={c.k} ja={c.j} deckId={id} /></div>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                <button className="btn-ghost px-2 py-1" onClick={() => speakKo(c.k)} aria-label="読み上げ">🔊</button>
                {youtubeAt(source?.url, c.t) && <a className="text-stone-500 underline" href={youtubeAt(source?.url, c.t)} target="_blank" rel="noreferrer">{formatClock(c.t)}</a>}
                <div className="flex gap-1">
                  <button className="btn-ghost px-2 py-1" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button className="btn-ghost px-2 py-1" disabled={i === cards.length - 1} onClick={() => move(i, 1)}>↓</button>
                </div>
                <button className="text-stone-500 underline" onClick={() => setEditing(c.id!)}>編集</button>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  )
}

function EditRow({ card, onDone }: { card: PhraseCard; onDone: () => void }) {
  const [k, setK] = useState(card.k)
  const [p, setP] = useState(card.p)
  const [j, setJ] = useState(card.j)
  return (
    <li className="card space-y-2">
      <input className="input ko text-lg" value={k} onChange={(e) => setK(e.target.value)} />
      <input className="input" value={p} onChange={(e) => setP(e.target.value)} placeholder="カタカナ" />
      <input className="input" value={j} onChange={(e) => setJ(e.target.value)} placeholder="日本語訳" />
      <div className="flex gap-2">
        <button className="btn-ghost text-rose-600" onClick={async () => { await db.cards.delete(card.id!); onDone() }}>削除</button>
        <button className="btn-ghost ml-auto" onClick={onDone}>キャンセル</button>
        <button className="btn-primary" onClick={async () => { await db.cards.update(card.id!, { k, p, j }); onDone() }}>保存</button>
      </div>
    </li>
  )
}

function DeckImage({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" className="max-h-56 rounded-xl border border-stone-200 object-contain dark:border-stone-800" /></a> : null
}
