import { useLiveQuery } from 'dexie-react-hooks'
import { addWord, db } from '../db/db'
import type { Word } from '../lib/types'
import { wordKey } from '../lib/words'

/** フレーズに入っている単語。＋で単語デッキに追加 */
export default function WordChips({ words, sentence, ja, deckId }: { words: Word[]; sentence: string; ja?: string; deckId?: number }) {
  const saved = useLiveQuery(async () => new Set((await db.words.toArray()).map((w) => w.base)), [])
  if (!words.length) return null
  return (
    <ul className="mx-auto flex max-w-md flex-wrap justify-center gap-2 text-sm">
      {words.map((w, i) => {
        const has = saved?.has(wordKey(w))
        return (
          <li key={i} className="flex items-center gap-1 rounded-full bg-stone-100 py-1 pr-1 pl-3 dark:bg-stone-800">
            <span className="ko font-semibold">{w.k}</span>
            <span className="text-stone-500">{w.j}</span>
            <button
              className={`ml-1 grid h-6 w-6 place-items-center rounded-full text-xs ${has ? 'bg-emerald-600 text-white' : 'bg-white text-stone-600 hover:bg-rose-600 hover:text-white dark:bg-stone-700 dark:text-stone-200'}`}
              title={has ? '単語デッキにあります' : '単語デッキに追加'}
              onClick={(e) => { e.stopPropagation(); if (!has) addWord(w, { sentence, ja, deckId }) }}
            >
              {has ? '✓' : '＋'}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
