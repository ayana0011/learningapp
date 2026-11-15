import { useLiveQuery } from 'dexie-react-hooks'
import { useParams } from 'react-router-dom'
import StudySession from '../components/StudySession'
import WordChips from '../components/WordChips'
import { db } from '../db/db'
import { formatClock } from '../lib/parse'
import { youtubeAt } from '../lib/settings'
import type { PhraseCard } from '../lib/types'

export default function StudyPage() {
  const id = Number(useParams().id)
  const deck = useLiveQuery(() => db.decks.get(id), [id])
  const source = useLiveQuery(() => (deck ? db.sources.get(deck.sourceId) : undefined), [deck])
  if (!deck) return <p>読み込み中…</p>

  return (
    <StudySession<PhraseCard>
      key={id}
      title={deck.title}
      backTo={`/deck/${id}`}
      load={async () => {
        const now = Date.now()
        return (await db.cards.where('deckId').equals(id).sortBy('order')).filter((c) => c.due <= now)
      }}
      save={(c, r) => db.cards.update(c.id!, { ...r })}
      renderBack={(c) => (
        <>
          <p className="text-stone-500">{c.p}</p>
          <WordChips words={c.w} sentence={c.k} ja={c.j} deckId={id} />
        </>
      )}
      renderActions={(c) => {
        const link = youtubeAt(source?.url, c.t)
        return link ? <a className="btn-ghost" href={link} target="_blank" rel="noreferrer">▶ この場面を見る（{formatClock(c.t)}）</a> : null
      }}
      doneExtra={source?.url && (
        <p className="text-sm">覚えたら<a className="mx-1 text-rose-600 underline" href={source.url} target="_blank" rel="noreferrer">元の動画</a>を見て、聞き取れるか試してみましょう</p>
      )}
    />
  )
}
