import Dexie, { type EntityTable } from 'dexie'
import type { Deck, GeneratedItem, PhraseCard, Source, StudyLog, Word, WordCard, WordExample } from '../lib/types'
import { mergeWord, wordKey } from '../lib/words'
import { dayKey } from '../lib/srs'
import { blobToDataUrl, dataUrlToBlob } from '../lib/image'

export const db = new Dexie('phrase-flashcards') as Dexie & {
  sources: EntityTable<Source, 'id'>
  decks: EntityTable<Deck, 'id'>
  cards: EntityTable<PhraseCard, 'id'>
  logs: EntityTable<StudyLog, 'id'>
  words: EntityTable<WordCard, 'id'>
}

db.version(1).stores({
  sources: '++id, kind, artist, createdAt',
  decks: '++id, sourceId, createdAt',
  cards: '++id, deckId, due, stage, k',
  logs: '++id, &day',
})
db.version(2).stores({
  words: '++id, base, due, stage',
})

/** 単語デッキに追加（同じ辞書形があれば例文を足す）。追加・更新したカードの id を返す */
export async function addWord(w: Word, example?: WordExample): Promise<number> {
  const base = wordKey(w)
  const existing = await db.words.where('base').equals(base).first()
  const next = mergeWord(existing, w, example)
  if (existing) { await db.words.put(next); return existing.id! }
  return (await db.words.add(next))!
}

export async function hasWord(w: Word): Promise<boolean> {
  return !!(await db.words.where('base').equals(wordKey(w)).first())
}

export async function addGeneratedCards(deckId: number, items: GeneratedItem[]): Promise<{ added: number; skipped: number }> {
  const existing = new Set((await db.cards.toArray()).map((c) => normalize(c.k)))
  const last = await db.cards.where('deckId').equals(deckId).last()
  let order = (last?.order ?? 0) + 1
  const rows: PhraseCard[] = []
  let skipped = 0
  for (const it of items) {
    const key = normalize(it.k)
    if (existing.has(key)) { skipped++; continue }
    existing.add(key)
    rows.push({ ...it, deckId, order: order++, due: 0, stage: 0, reps: 0 })
  }
  await db.cards.bulkAdd(rows)
  return { added: rows.length, skipped }
}

export function normalize(k: string): string {
  return k.replace(/[\s.,!?。、…~"'“”]/g, '')
}

export async function logStudy(seconds: number, reviewed: number, learned: number) {
  const day = dayKey()
  const cur = await db.logs.where('day').equals(day).first()
  if (cur) await db.logs.update(cur.id!, { seconds: cur.seconds + seconds, reviewed: cur.reviewed + reviewed, learned: cur.learned + learned })
  else await db.logs.add({ day, seconds, reviewed, learned })
}

/** バックアップ用 JSON */
export async function exportAll() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    // 画像は JSON に入らないので data URL にする
    sources: await Promise.all((await db.sources.toArray()).map(async (s) => (s.image ? { ...s, image: undefined, imageData: await blobToDataUrl(s.image) } : s))),
    decks: await db.decks.toArray(),
    cards: await db.cards.toArray(),
    logs: await db.logs.toArray(),
    words: await db.words.toArray(),
  }
}

export async function importAll(data: Awaited<ReturnType<typeof exportAll>>) {
  const sources = await Promise.all(data.sources.map(async (s: Source & { imageData?: string }) => {
    const { imageData, ...rest } = s
    return imageData ? { ...rest, image: await dataUrlToBlob(imageData) } : rest
  }))
  await db.transaction('rw', [db.sources, db.decks, db.cards, db.logs, db.words], async () => {
    await Promise.all([db.sources.clear(), db.decks.clear(), db.cards.clear(), db.logs.clear(), db.words.clear()])
    await db.sources.bulkAdd(sources)
    await db.decks.bulkAdd(data.decks)
    await db.cards.bulkAdd(data.cards)
    await db.logs.bulkAdd(data.logs)
    await db.words.bulkAdd(data.words ?? [])
  })
}
