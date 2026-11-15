import StudySession from '../components/StudySession'
import { db } from '../db/db'
import type { WordCard } from '../lib/types'

export default function StudyWordsPage() {
  return (
    <StudySession<WordCard>
      title="単語デッキ"
      backTo="/words"
      load={async () => {
        const now = Date.now()
        // 意味がまだない単語は出さない
        return (await db.words.toArray()).sort((a, b) => a.createdAt - b.createdAt).filter((w) => w.due <= now && w.j)
      }}
      save={(w, r) => db.words.update(w.id!, { ...r })}
      renderBack={(w) => (
        <>
          <p className="text-stone-500">{w.p}{w.base !== w.k && <span className="ko ml-2">（{w.base}）</span>}</p>
          {w.examples.length > 0 && (
            <ul className="mx-auto max-w-md space-y-1 text-left text-sm">
              {w.examples.slice(-3).map((e, i) => (
                <li key={i} className="rounded-lg bg-stone-100 px-3 py-1.5 dark:bg-stone-800">
                  <span className="ko">{highlight(e.sentence, w.k)}</span>
                  {e.ja && <span className="block text-xs text-stone-500">{e.ja}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    />
  )
}

function highlight(sentence: string, word: string) {
  const i = sentence.indexOf(word)
  if (i < 0) return sentence
  return <>{sentence.slice(0, i)}<b className="text-rose-600">{word}</b>{sentence.slice(i + word.length)}</>
}
