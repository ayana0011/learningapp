import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addWord, db, removeRows } from '../db/db'
import { isLearned } from '../lib/srs'
import { speakKo } from '../lib/settings'
import type { WordCard } from '../lib/types'
import { buildWordPrompt, extractWords, wordKey } from '../lib/words'

export default function WordsPage() {
  const words = useLiveQuery(() => db.words.toArray(), [])
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<number | null>(null)

  if (!words) return <p>読み込み中…</p>
  const now = Date.now()
  const ready = words.filter((w) => w.j)
  const due = ready.filter((w) => w.due <= now).length
  const missing = words.filter((w) => !w.j)
  const shown = words
    .filter((w) => !q || w.k.includes(q) || w.base.includes(q) || w.j.includes(q))
    .sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">単語デッキ</h1>
        <p className="text-sm text-stone-500">{words.length} 語 · 覚えた {words.filter(isLearned).length} 語</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/study-words" className={`btn-primary ${due ? '' : 'pointer-events-none opacity-40'}`}>暗記する（{due} 語）</Link>
        <input className="input ml-auto max-w-48" placeholder="検索" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {words.length === 0 && (
        <p className="card text-sm text-stone-500">
          フレーズの暗記で裏面の単語の「＋」を押すか、tblfan 拡張で単語をクリック →「＋単語を保存」すると、ここに集まります。
        </p>
      )}

      {missing.length > 0 && <MissingMeanings words={missing} />}

      <ul className="space-y-2">
        {shown.map((w) =>
          editing === w.id ? (
            <EditWord key={w.id} word={w} onDone={() => setEditing(null)} />
          ) : (
            <li key={w.id} className="card flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p>
                  <span className="ko text-lg font-semibold">{w.k}</span>
                  {w.base !== w.k && <span className="ko ml-2 text-sm text-stone-500">{w.base}</span>}
                  <span className="ml-2 text-sm text-stone-500">{w.p}</span>
                </p>
                <p className={w.j ? '' : 'text-sm text-amber-700 dark:text-amber-400'}>{w.j || '意味がまだありません'}</p>
                {w.examples[0] && <p className="ko mt-1 truncate text-xs text-stone-500">{w.examples[w.examples.length - 1].sentence}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                {isLearned(w) && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">覚えた</span>}
                <button className="btn-ghost px-2 py-1" onClick={() => speakKo(w.k)} aria-label="読み上げ">🔊</button>
                <button className="text-stone-500 underline" onClick={() => setEditing(w.id!)}>編集</button>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  )
}

/** 意味がない単語（拡張で保存したものなど）の意味をまとめて作る */
function MissingMeanings({ words }: { words: WordCard[] }) {
  const [copied, setCopied] = useState(false)
  const [reply, setReply] = useState('')
  const [msg, setMsg] = useState('')
  const prompt = useMemo(() => buildWordPrompt(words.slice(0, 80).map((w) => ({ k: w.k, sentence: w.examples[0]?.sentence }))), [words])
  const parsed = useMemo(() => (reply.trim() ? extractWords(reply) : null), [reply])

  async function apply() {
    if (!parsed) return
    let n = 0
    for (const it of parsed.items) {
      const target = words.find((w) => w.k === it.k || w.base === wordKey(it))
      if (!target) continue
      const newBase = wordKey(it)
      const other = newBase !== target.base ? await db.words.where('base').equals(newBase).first() : undefined
      if (other && other.id !== target.id) {
        // 辞書形が同じ単語がすでにあれば、そちらにまとめる
        for (const ex of target.examples) await addWord({ ...it, k: other.k, b: newBase }, ex)
        await removeRows('words', [target.id!])
      } else {
        await db.words.update(target.id!, { j: it.j, p: it.p || target.p, base: newBase })
      }
      n++
    }
    setMsg(`${n} 語に意味を付けました${parsed.errors.length ? `（読めなかった項目 ${parsed.errors.length}）` : ''}`)
    setReply('')
  }

  return (
    <section className="card space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold">意味がまだない単語: {words.length} 語</h2>
        <button className="btn-primary ml-auto" onClick={async () => { await navigator.clipboard.writeText(prompt); setCopied(true) }}>
          {copied ? '✓ コピーしました' : '意味づけプロンプトをコピー'}
        </button>
      </div>
      <p className="text-stone-500">
        <span className="ko">{words.slice(0, 12).map((w) => w.k).join('・')}{words.length > 12 ? ' …' : ''}</span>
        <br />プロンプトを claude.ai に貼り、返ってきた答えを下に貼り付けてください。
      </p>
      <textarea className="input h-24 font-mono text-xs" placeholder="claude.ai の答えをここに貼り付け" value={reply} onChange={(e) => { setReply(e.target.value); setMsg('') }} />
      {parsed?.errors.map((e, i) => <p key={i} className="text-amber-700 dark:text-amber-400">⚠ {e}</p>)}
      <div className="flex items-center gap-3">
        {msg && <p className="text-emerald-700 dark:text-emerald-400">{msg}</p>}
        <button className="btn-primary ml-auto" disabled={!parsed?.items.length} onClick={apply}>意味を付ける（{parsed?.items.length ?? 0}）</button>
      </div>
    </section>
  )
}

function EditWord({ word, onDone }: { word: WordCard; onDone: () => void }) {
  const [k, setK] = useState(word.k)
  const [j, setJ] = useState(word.j)
  const [p, setP] = useState(word.p)
  return (
    <li className="card space-y-2">
      <input className="input ko text-lg" value={k} onChange={(e) => setK(e.target.value)} />
      <input className="input" value={j} onChange={(e) => setJ(e.target.value)} placeholder="意味" />
      <input className="input" value={p} onChange={(e) => setP(e.target.value)} placeholder="カタカナ" />
      <div className="flex gap-2">
        <button className="btn-ghost text-rose-600" onClick={async () => { await removeRows('words', [word.id!]); onDone() }}>削除</button>
        <button className="btn-ghost ml-auto" onClick={onDone}>キャンセル</button>
        <button className="btn-primary" onClick={async () => { await db.words.update(word.id!, { k, j, p }); onDone() }}>保存</button>
      </div>
    </li>
  )
}
