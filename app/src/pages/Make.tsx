import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { addGeneratedCards, db } from '../db/db'
import { extractItems } from '../lib/extract'
import { buildPrompts } from '../lib/prompt'
import { isLearned } from '../lib/srs'
import { helperGenerate, useHelper } from '../lib/helper'
import ImageMake from '../components/ImageMake'
import HelperHint from '../components/HelperHint'

export default function MakePage() {
  const id = Number(useParams().id)
  const deck = useLiveQuery(() => db.decks.get(id), [id])
  const source = useLiveQuery(() => (deck ? db.sources.get(deck.sourceId) : undefined), [deck])
  const known = useLiveQuery(async () => (await db.cards.toArray()).filter(isLearned).map((c) => c.k), [])
  const count = useLiveQuery(() => db.cards.where('deckId').equals(id).count(), [id])
  const helper = useHelper()
  const runners = useRef(new Map<number, () => Promise<boolean>>())
  const [allRunning, setAllRunning] = useState(false)

  // 一度プロンプトを作ったら固定する（カードが増えて「覚えた文」が変わっても、パートの中身が変わらないように）
  const promptsRef = useRef<string[] | null>(null)
  const prompts = useMemo(() => {
    if (!deck || !source || known === undefined) return []
    if (promptsRef.current) return promptsRef.current
    const lines = source.lines.slice(deck.range[0], deck.range[1])
    promptsRef.current = buildPrompts(lines, { title: source.title, kind: source.kind, artist: source.artist, known })
    return promptsRef.current
  }, [deck, source, known])

  async function runAll() {
    setAllRunning(true)
    for (let i = 0; i < prompts.length; i++) {
      const run = runners.current.get(i)
      if (run && !(await run())) break // 失敗したらそこで止める
    }
    setAllRunning(false)
  }

  if (!deck || !source) return <p>読み込み中…</p>

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/deck/${id}`} className="text-sm text-stone-500">← {deck.title}</Link>
        <h1 className="text-xl font-bold">カードを作る</h1>
        <p className="mt-1 text-sm text-stone-500">いまのカード: {count ?? 0} 枚</p>
      </div>

      {source.kind === 'image' ? <ImageMake deck={deck} source={source} helper={helper} /> : <>
        {helper ? (
          <div className="card flex flex-wrap items-center gap-3 text-sm">
            <p className="flex-1">🤖 Claude Code につながっています。ボタンを押すと自動でカードができます。</p>
            {prompts.length > 1 && <button className="btn-primary" disabled={allRunning} onClick={runAll}>{allRunning ? '作成中…' : `全 ${prompts.length} パートを自動作成`}</button>}
          </div>
        ) : (
          <ol className="card list-decimal space-y-1 pl-8 text-sm">
            <li>「プロンプトをコピー」を押す</li>
            <li>
              <a className="text-rose-600 underline" href="https://claude.ai/new" target="_blank" rel="noreferrer">claude.ai</a>
              {' '}を開いて貼り付けて送信（<b>モデルは Sonnet</b> を選ぶと使用量を節約できます）
            </li>
            <li>返ってきた答えを<b>まるごとコピー</b>して、下の欄に貼り付け →「カードに追加」</li>
          </ol>
        )}
        <HelperHint ok={helper} />

        {prompts.map((p, i) => (
          <Part key={i} index={i} total={prompts.length} prompt={p} deckId={id} helper={!!helper}
            register={(fn) => { runners.current.set(i, fn) }} />
        ))}
      </>}

      <div className="flex justify-end">
        <Link to={`/deck/${id}`} className="btn-primary">デッキを見る →</Link>
      </div>
    </div>
  )
}

interface PartProps {
  index: number
  total: number
  prompt: string
  deckId: number
  helper: boolean
  register: (run: () => Promise<boolean>) => void
}

function Part({ index, total, prompt, deckId, helper, register }: PartProps) {
  const [copied, setCopied] = useState(false)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const parsed = useMemo(() => (reply.trim() ? extractItems(reply) : null), [reply])

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
    } catch {
      setMsg({ ok: false, text: 'コピーできませんでした。下の「プロンプトを表示」から手動でコピーしてください。' })
    }
  }

  async function add(p = parsed) {
    if (!p || !p.items.length) return false
    const r = await addGeneratedCards(deckId, p.items)
    setMsg({ ok: true, text: `${r.added} 枚追加しました${r.skipped ? `（重複 ${r.skipped} 枚はスキップ）` : ''}${p.errors.length ? `・読めなかった項目 ${p.errors.length}` : ''}` })
    setReply('')
    setDone(true)
    return true
  }

  // Claude Code で自動作成 → そのままカードに追加
  async function auto(): Promise<boolean> {
    if (done) return true
    setBusy(true)
    setMsg({ ok: true, text: 'Claude Code が作成中…（1〜2分かかることがあります）' })
    try {
      const text = await helperGenerate(prompt)
      const p = extractItems(text)
      if (!p.items.length) {
        setReply(text)
        setMsg({ ok: false, text: `カードを読み取れませんでした: ${p.errors[0] ?? ''}` })
        return false
      }
      return await add(p)
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
      return false
    } finally {
      setBusy(false)
    }
  }
  register(auto)

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-semibold">{total > 1 ? `パート ${index + 1} / ${total}` : 'プロンプト'}{done && ' ✓'}</h2>
        {helper && <button className="btn-primary" disabled={busy || done} onClick={auto}>{busy ? '作成中…' : done ? '✓ 作成済み' : '🤖 Claude Code で自動作成'}</button>}
        <button className={helper ? 'btn-ghost' : 'btn-primary'} onClick={copy}>{copied ? '✓ コピーしました' : 'プロンプトをコピー'}</button>
      </div>
      <details className="text-xs text-stone-500">
        <summary className="cursor-pointer">プロンプトを表示（{prompt.length.toLocaleString()} 文字）</summary>
        <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-stone-100 p-2 ko dark:bg-stone-800">{prompt}</pre>
      </details>
      {!helper || reply ? (
        <textarea className="input h-32 font-mono text-xs" placeholder="claude.ai の答えをここに貼り付け" value={reply} onChange={(e) => { setReply(e.target.value); setMsg(null) }} />
      ) : null}
      {parsed && (
        <div className="text-sm">
          {parsed.items.length > 0 && <p className="text-emerald-700 dark:text-emerald-400">{parsed.items.length} 枚のカードを読み取りました</p>}
          {parsed.errors.map((e, i) => <p key={i} className="text-amber-700 dark:text-amber-400">⚠ {e}</p>)}
          {parsed.items.length > 0 && (
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto">
              {parsed.items.map((it, i) => (
                <li key={i} className="ko"><b>{it.k}</b> <span className="text-stone-500">— {it.j}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>{msg.text}</p>}
        {(!helper || reply) && <button className="btn-primary ml-auto" disabled={!parsed?.items.length} onClick={() => add()}>カードに追加</button>}
      </div>
    </section>
  )
}
