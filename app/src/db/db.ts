import Dexie, { type EntityTable, type Table } from 'dexie'
import type { Deck, GeneratedItem, PhraseCard, Source, StudyLog, Tombstone, Word, WordCard, WordExample } from '../lib/types'
import { mergeWord, wordKey } from '../lib/words'
import { dayKey } from '../lib/srs'
import { blobToDataUrl, dataUrlToBlob } from '../lib/image'
import { decide, mergeLog, newUid } from '../lib/sync'
import { deviceId } from '../lib/settings'

export const db = new Dexie('phrase-flashcards') as Dexie & {
  sources: EntityTable<Source, 'id'>
  decks: EntityTable<Deck, 'id'>
  cards: EntityTable<PhraseCard, 'id'>
  logs: EntityTable<StudyLog, 'id'>
  words: EntityTable<WordCard, 'id'>
  tombstones: EntityTable<Tombstone, 'id'>
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
// 同期のために、端末をまたいで使える uid と更新時刻を持たせる
db.version(3)
  .stores({
    sources: '++id, kind, artist, createdAt, uid',
    decks: '++id, sourceId, createdAt, uid',
    cards: '++id, deckId, due, stage, k, uid',
    words: '++id, base, due, stage, uid',
    logs: '++id, day, [day+device]',
    tombstones: '++id, uid, table',
  })
  .upgrade(async (tx) => {
    const now = Date.now()
    for (const name of ['sources', 'decks', 'cards', 'words']) {
      await tx.table(name).toCollection().modify((r: { uid?: string; updatedAt?: number }) => {
        r.uid ??= newUid()
        r.updatedAt ??= now
      })
    }
    await tx.table('logs').toCollection().modify((l: StudyLog) => { l.device ??= deviceId() })
  })

const SYNCED = ['sources', 'decks', 'cards', 'words'] as const
type SyncedName = (typeof SYNCED)[number]

for (const name of SYNCED) {
  const t = db.table(name)
  t.hook('creating', (_pk, obj: { uid?: string; updatedAt?: number }) => {
    obj.uid ??= newUid()
    obj.updatedAt ??= Date.now()
  })
  t.hook('updating', (mods: object) => ('updatedAt' in mods ? undefined : { updatedAt: Date.now() }))
}

/** 削除（同期で復活しないように記録を残す） */
export async function removeRows(name: SyncedName, ids: number[]) {
  if (!ids.length) return
  const table = db.table(name) as Table<{ id?: number; uid?: string }, number>
  await db.transaction('rw', [table, db.tombstones], async () => {
    const rows = (await table.bulkGet(ids)).filter((r): r is { id?: number; uid?: string } => !!r)
    const at = Date.now()
    await db.tombstones.bulkAdd(rows.filter((r) => r.uid).map((r) => ({ uid: r.uid!, table: name, at })))
    await table.bulkDelete(ids)
  })
}

export async function removeDeck(deckId: number) {
  const cardIds = (await db.cards.where('deckId').equals(deckId).primaryKeys()) as number[]
  await removeRows('cards', cardIds)
  await removeRows('decks', [deckId])
}

/** 単語デッキに追加（同じ辞書形があれば例文を足す）。追加・更新したカードの id を返す */
export async function addWord(w: Word, example?: WordExample): Promise<number> {
  const base = wordKey(w)
  const existing = await db.words.where('base').equals(base).first()
  const next = mergeWord(existing, w, example)
  if (existing) {
    await db.words.update(existing.id!, { j: next.j, p: next.p, examples: next.examples })
    return existing.id!
  }
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
  const device = deviceId()
  const cur = await db.logs.where('[day+device]').equals([day, device]).first()
  if (cur) await db.logs.update(cur.id!, { seconds: cur.seconds + seconds, reviewed: cur.reviewed + reviewed, learned: cur.learned + learned })
  else await db.logs.add({ day, device, seconds, reviewed, learned })
}

// ---------- 同期ファイル ----------

type Strip<T> = Omit<T, 'id'>
export interface SyncFile {
  kind: 'phrase-flashcards-sync'
  version: 2
  device: string
  exportedAt: string
  sources: (Strip<Source> & { imageData?: string })[]
  decks: (Strip<Deck> & { sourceUid?: string })[]
  cards: (Strip<PhraseCard> & { deckUid?: string })[]
  words: (Strip<WordCard> & { examples: (WordExample & { deckUid?: string })[] })[]
  logs: Strip<StudyLog>[]
  tombstones: Strip<Tombstone>[]
}

/** 同期ファイル（バックアップにもなる）。端末ごとの id は uid に置きかえる */
export async function exportSync(): Promise<SyncFile> {
  const [sources, decks, cards, words, logs, tombstones] = await Promise.all([
    db.sources.toArray(), db.decks.toArray(), db.cards.toArray(), db.words.toArray(), db.logs.toArray(), db.tombstones.toArray(),
  ])
  const srcUid = new Map(sources.map((s) => [s.id, s.uid]))
  const deckUid = new Map(decks.map((d) => [d.id, d.uid]))
  const strip = <T extends { id?: number }>(r: T) => { const { id: _id, ...rest } = r; return rest }
  return {
    kind: 'phrase-flashcards-sync',
    version: 2,
    device: deviceId(),
    exportedAt: new Date().toISOString(),
    // 画像は JSON に入らないので data URL にする
    sources: await Promise.all(sources.map(async (s) => {
      const { image, ...rest } = strip(s)
      return image ? { ...rest, imageData: await blobToDataUrl(image) } : rest
    })),
    decks: decks.map((d) => ({ ...strip(d), sourceUid: srcUid.get(d.sourceId) })),
    cards: cards.map((c) => ({ ...strip(c), deckUid: deckUid.get(c.deckId) })),
    words: words.map((w) => ({ ...strip(w), examples: w.examples.map((e) => ({ ...e, deckUid: e.deckId !== undefined ? deckUid.get(e.deckId) : undefined })) })),
    logs: logs.map(strip),
    tombstones: tombstones.map(strip),
  }
}

export interface SyncResult { added: number; updated: number; removed: number }

/** 同期ファイルを手元のデータと合わせる（新しい方を残す。消したものは消したまま） */
export async function importSync(file: SyncFile): Promise<SyncResult> {
  if (file?.kind !== 'phrase-flashcards-sync') throw new Error('このアプリの同期ファイルではありません')
  // 画像の変換はトランザクションの外で先に済ませる
  const images = new Map<string, Blob>()
  for (const s of file.sources) if (s.imageData && s.uid) images.set(s.uid, await dataUrlToBlob(s.imageData))

  const res: SyncResult = { added: 0, updated: 0, removed: 0 }
  await db.transaction('rw', [db.sources, db.decks, db.cards, db.words, db.logs, db.tombstones], async () => {
    // 相手側で消されたもの
    const localTombs = new Map((await db.tombstones.toArray()).map((t) => [t.uid, t.at]))
    for (const t of file.tombstones) {
      const table = db.table(t.table) as Table<{ id?: number; updatedAt?: number }, number>
      const row = await table.where('uid').equals(t.uid).first()
      if (row && (row.updatedAt ?? 0) <= t.at) { await table.delete(row.id!); res.removed++ }
      if (!localTombs.has(t.uid)) { await db.tombstones.add({ ...t }); localTombs.set(t.uid, t.at) }
    }

    async function upsert<T extends { id?: number; uid?: string; updatedAt?: number }>(table: Table<T, number>, row: T): Promise<number | undefined> {
      if (!row.uid) return undefined
      const local = await table.where('uid').equals(row.uid).first()
      const act = decide(local, row, localTombs.get(row.uid))
      if (act === 'add') { res.added++; return (await table.add({ ...row, id: undefined } as T)) as number }
      if (act === 'update') { res.updated++; await table.put({ ...row, id: local!.id } as T); return local!.id }
      return local?.id
    }

    const srcId = new Map<string, number>()
    for (const s of file.sources) {
      const { imageData: _d, ...rest } = s
      const id = await upsert(db.sources as Table<Source, number>, { ...rest, image: images.get(s.uid!) } as Source)
      if (id !== undefined) srcId.set(s.uid!, id)
    }
    const deckId = new Map<string, number>()
    for (const d of file.decks) {
      const { sourceUid, ...rest } = d
      const sid = sourceUid ? srcId.get(sourceUid) ?? (await db.sources.where('uid').equals(sourceUid).first())?.id : undefined
      if (sid === undefined) continue
      const id = await upsert(db.decks as Table<Deck, number>, { ...rest, sourceId: sid } as Deck)
      if (id !== undefined) deckId.set(d.uid!, id)
    }
    const deckOf = async (uid?: string) => (uid ? deckId.get(uid) ?? (await db.decks.where('uid').equals(uid).first())?.id : undefined)
    for (const c of file.cards) {
      const { deckUid, ...rest } = c
      const did = await deckOf(deckUid)
      if (did === undefined) continue
      await upsert(db.cards as Table<PhraseCard, number>, { ...rest, deckId: did } as PhraseCard)
    }
    for (const w of file.words) {
      const examples = await Promise.all((w.examples as (WordExample & { deckUid?: string })[]).map(async ({ deckUid, ...e }) => ({ ...e, deckId: await deckOf(deckUid) })))
      // 別々の端末で同じ単語を追加した場合（uid は違うが辞書形が同じ）は、1枚にまとめる
      const sameBase = !(await db.words.where('uid').equals(w.uid!).first()) && (await db.words.where('base').equals(w.base).first())
      if (sameBase) {
        if ((w.updatedAt ?? 0) > (sameBase.updatedAt ?? 0) && w.reps >= sameBase.reps) {
          await db.words.put({ ...sameBase, ...w, examples, id: sameBase.id, uid: sameBase.uid }); res.updated++
        }
        continue
      }
      await upsert(db.words as Table<WordCard, number>, { ...w, examples } as WordCard)
    }
    for (const l of file.logs) {
      if (!l.device) continue
      const local = await db.logs.where('[day+device]').equals([l.day, l.device]).first()
      if (local) await db.logs.put(mergeLog(local, l as StudyLog))
      else await db.logs.add({ ...l })
    }
  })
  return res
}
