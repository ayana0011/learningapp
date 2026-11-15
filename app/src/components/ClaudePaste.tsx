import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addGeneratedCards, addWord, db } from '../db/db'
import { CLAUDE_PROJECT_INSTRUCTIONS, CLAUDE_PROJECT_NAME } from '../lib/claudeProject'
import { extractImageReply } from '../lib/image'
import NoteView from './NoteView'

/** claude.ai（スマホの Claude アプリなど）で調べた答えを、貼り付けて単語帳に入れる */
export default function ClaudePaste() {
  const nav = useNavigate()
  const [reply, setReply] = useState('')
  const [title, setTitle] = useState('')
  const [allWords, setAllWords] = useState(true)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const parsed = useMemo(() => (reply.trim() ? extractImageReply(reply) : null), [reply])

  async function pasteFromClipboard() {
    setErr('')
    try {
      const t = await navigator.clipboard.readText()
      if (!t.trim()) { setErr('クリップボードが空です。Claude の答えをコピーしてから押してください'); return }
      setReply(t)
    } catch {
      setErr('クリップボードを読めませんでした。下の欄に長押しで貼り付けてください')
    }
  }

  async function save() {
    if (!parsed) return
    const now = Date.now()
    const name = title.trim() || parsed.note?.text.split('\n')[0].slice(0, 24) || `Claude ${new Date(now).toLocaleDateString('ja-JP')}`
    const lines = (parsed.note?.text ?? '').split('\n').map((t) => t.trim()).filter(Boolean).map((text) => ({ text }))
    const sourceId = await db.sources.add({ title: name, kind: 'other', lines, note: parsed.note ?? undefined, createdAt: now })
    const deckId = (await db.decks.add({ sourceId: sourceId!, title: name, range: [0, lines.length], createdAt: now }))!
    await addGeneratedCards(deckId, parsed.items)
    if (allWords) for (const it of parsed.items) for (const w of it.w) await addWord(w, { sentence: it.k, ja: it.j, deckId })
    nav(`/deck/${deckId}`)
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-3 text-sm">
        <h2 className="font-semibold">Claude で調べた答えを貼り付ける</h2>
        <p className="text-stone-500">Claude アプリの答えの最後にある JSON のコピーボタン（または答え全体のコピー）を押してから、ここで貼り付けます。</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={pasteFromClipboard}>📋 コピーした答えを貼り付け</button>
        </div>
        <textarea className="input h-28 font-mono text-xs" placeholder="ここに長押しで貼り付けてもOK" value={reply} onChange={(e) => setReply(e.target.value)} />
        {err && <p className="text-amber-700 dark:text-amber-400">{err}</p>}
        {parsed?.errors.map((e, i) => <p key={i} className="text-amber-700 dark:text-amber-400">⚠ {e}</p>)}
      </section>

      {parsed && (parsed.items.length > 0 || parsed.note) && (
        <>
          {parsed.note && <NoteView note={parsed.note} />}
          <section className="card space-y-3 text-sm">
            <p className="text-emerald-700 dark:text-emerald-400">カード {parsed.items.length} 枚・単語 {parsed.items.reduce((a, it) => a + it.w.length, 0)} 語</p>
            <ul className="space-y-1">
              {parsed.items.map((it, i) => <li key={i} className="ko"><b>{it.k}</b> <span className="text-stone-500">— {it.j}</span></li>)}
            </ul>
            <input className="input" placeholder="メモ（任意。例: ◯◯のインスタ）" value={title} onChange={(e) => setTitle(e.target.value)} />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={allWords} onChange={(e) => setAllWords(e.target.checked)} />
              出てきた単語をすべて単語デッキにも入れる
            </label>
            <div className="flex"><button className="btn-primary ml-auto" onClick={save}>単語帳に追加</button></div>
          </section>
        </>
      )}

      <details className="card space-y-2 text-sm">
        <summary className="cursor-pointer font-semibold">はじめに: Claude アプリの準備（1回だけ）</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-stone-600 dark:text-stone-400">
          <li>claude.ai（またはアプリ）で「プロジェクト」を新しく作る（名前の例: {CLAUDE_PROJECT_NAME}）</li>
          <li>プロジェクトの「指示（Instructions）」に、下の文章を貼り付けて保存</li>
          <li>韓国語の画像や文章を調べるときは、そのプロジェクトの中で聞く → 答えの最後に JSON が付く</li>
          <li>JSON をコピー → このアプリの「取り込み → 💬 Claude」で貼り付け</li>
        </ol>
        <button className="btn-ghost" onClick={async () => { await navigator.clipboard.writeText(CLAUDE_PROJECT_INSTRUCTIONS); setCopied(true) }}>
          {copied ? '✓ コピーしました' : '指示文をコピー'}
        </button>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-stone-100 p-2 text-xs dark:bg-stone-800">{CLAUDE_PROJECT_INSTRUCTIONS}</pre>
      </details>
    </div>
  )
}
