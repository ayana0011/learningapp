import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { addGeneratedCards, addWord, db } from '../db/db'
import { buildImagePrompt, copyImage, extractImageReply } from '../lib/image'
import { isLearned } from '../lib/srs'
import type { Deck, Source } from '../lib/types'
import NoteView from './NoteView'
import HelperHint from './HelperHint'
import { helperGenerate } from '../lib/helper'
import type { ImageReply } from '../lib/image'

/** 画像から解説とカードを作る（claude.ai に画像とプロンプトを貼る） */
export default function ImageMake({ deck, source, helper }: { deck: Deck; source: Source; helper: boolean | null }) {
  const known = useLiveQuery(async () => (await db.cards.toArray()).filter(isLearned).map((c) => c.k), [])
  const prompt = useMemo(() => buildImagePrompt({ title: source.title, known }), [source.title, known])
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState<'' | 'image' | 'prompt'>('')
  const [copyErr, setCopyErr] = useState('')
  const [reply, setReply] = useState('')
  const [allWords, setAllWords] = useState(true)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const parsed = useMemo(() => (reply.trim() ? extractImageReply(reply) : null), [reply])

  useEffect(() => {
    if (!source.image) return
    const u = URL.createObjectURL(source.image)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [source.image])

  async function doCopyImage() {
    setCopyErr('')
    try { await copyImage(source.image!); setCopied('image') } catch {
      setCopyErr('画像をコピーできませんでした。「画像を保存」してから claude.ai にドラッグしてください。')
    }
  }

  async function auto() {
    setBusy(true)
    setMsg('Claude Code が画像を読んでいます…（1〜2分かかることがあります）')
    try {
      const text = await helperGenerate(prompt, source.image)
      const p = extractImageReply(text)
      if (!p.items.length && !p.note) { setReply(text); setMsg(`読み取れませんでした: ${p.errors[0] ?? ''}`); return }
      await save(p)
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function save(p: ImageReply | null = parsed) {
    if (!p) return
    const { items, note } = p
    if (note) {
      const lines = note.text.split('\n').map((t) => t.trim()).filter(Boolean).map((text) => ({ text }))
      await db.sources.update(source.id!, { note, lines })
      await db.decks.update(deck.id!, { range: [0, lines.length] })
    }
    const r = await addGeneratedCards(deck.id!, items)
    let nw = 0
    if (allWords) {
      for (const it of items) for (const w of it.w) { await addWord(w, { sentence: it.k, ja: it.j, deckId: deck.id }); nw++ }
    }
    setMsg(`カード ${r.added} 枚${r.skipped ? `（重複 ${r.skipped} 枚はスキップ）` : ''}${nw ? `・単語 ${nw} 語を単語デッキに入れました` : ''}`)
    setReply('')
  }

  return (
    <>
      {source.note && <NoteView note={source.note} />}

      {helper && (
        <div className="card flex flex-wrap items-center gap-3 text-sm">
          <p className="flex-1">🤖 Claude Code につながっています。ボタンを押すと、画像の解説とカードを自動で作ります。</p>
          <button className="btn-primary" disabled={busy} onClick={auto}>{busy ? '作成中…' : '🤖 Claude Code で自動作成'}</button>
        </div>
      )}
      <HelperHint ok={helper} />

      <ol className="card list-decimal space-y-1 pl-8 text-sm">
        <li><a className="text-rose-600 underline" href="https://claude.ai/new" target="_blank" rel="noreferrer">claude.ai</a> を開く（モデルは Sonnet で十分です）</li>
        <li>「画像をコピー」→ claude.ai の入力欄に貼り付け（⌘V）</li>
        <li>「プロンプトをコピー」→ 続けて貼り付けて送信</li>
        <li>返ってきた答えを<b>まるごと</b>コピーして、下の欄に貼り付け</li>
      </ol>

      <section className="card space-y-3">
        {url && <img src={url} alt={source.title} className="mx-auto max-h-72 rounded-lg object-contain" />}
        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn-primary" onClick={doCopyImage}>{copied === 'image' ? '✓ 画像をコピーしました' : '① 画像をコピー'}</button>
          <button className="btn-primary" onClick={async () => { await navigator.clipboard.writeText(prompt); setCopied('prompt') }}>{copied === 'prompt' ? '✓ プロンプトをコピーしました' : '② プロンプトをコピー'}</button>
          {url && <a className="btn-ghost" href={url} download={`${source.title}.jpg`}>画像を保存</a>}
        </div>
        {copyErr && <p className="text-sm text-amber-700 dark:text-amber-400">{copyErr}</p>}
        <details className="text-xs text-stone-500">
          <summary className="cursor-pointer">プロンプトを表示</summary>
          <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-stone-100 p-2 dark:bg-stone-800">{prompt}</pre>
        </details>
      </section>

      <section className="card space-y-3">
        <textarea className="input h-32 font-mono text-xs" placeholder="claude.ai の答えをここに貼り付け" value={reply} onChange={(e) => { setReply(e.target.value); setMsg('') }} />
        {parsed && (
          <div className="space-y-2 text-sm">
            {parsed.errors.map((e, i) => <p key={i} className="text-amber-700 dark:text-amber-400">⚠ {e}</p>)}
            {parsed.note && <p className="text-emerald-700 dark:text-emerald-400">解説を読み取りました（ポイント {parsed.note.notes.length} 個）</p>}
            {parsed.items.length > 0 && (
              <>
                <p className="text-emerald-700 dark:text-emerald-400">{parsed.items.length} 枚のカード・単語 {parsed.items.reduce((a, it) => a + it.w.length, 0)} 語</p>
                <ul className="max-h-40 space-y-1 overflow-auto">
                  {parsed.items.map((it, i) => <li key={i} className="ko"><b>{it.k}</b> <span className="text-stone-500">— {it.j}</span></li>)}
                </ul>
              </>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allWords} onChange={(e) => setAllWords(e.target.checked)} />
            出てきた単語をすべて単語デッキにも入れる
          </label>
          <button className="btn-primary ml-auto" disabled={!parsed || (!parsed.items.length && !parsed.note)} onClick={() => save()}>解説とカードを保存</button>
        </div>
        {msg && <p className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</p>}
      </section>
    </>
  )
}
