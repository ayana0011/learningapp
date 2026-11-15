import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { shrinkImage } from '../lib/image'

/** 画像（スクショ・写真）から取り込む */
export default function ImageImport() {
  const nav = useNavigate()
  const [file, setFile] = useState<Blob | null>(null)
  const [preview, setPreview] = useState('')
  const [title, setTitle] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)

  useEffect(() => {
    if (!file) { setPreview(''); return }
    const u = URL.createObjectURL(file)
    setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  // ⌘V で画像を貼り付け
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
      const f = item?.getAsFile()
      if (f) { e.preventDefault(); pick(f) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  function pick(f: File | Blob | undefined | null) {
    setErr('')
    if (!f) return
    if (!f.type.startsWith('image/')) { setErr('画像ファイルを選んでください'); return }
    setFile(f)
  }

  async function create() {
    if (!file) return
    setBusy(true)
    try {
      const image = await shrinkImage(file)
      const now = Date.now()
      const name = title.trim() || `画像 ${new Date(now).toLocaleDateString('ja-JP')}`
      const sourceId = await db.sources.add({ title: name, kind: 'image', lines: [], image, createdAt: now })
      const deckId = await db.decks.add({ sourceId: sourceId!, title: name, range: [0, 0], createdAt: now })
      nav(`/deck/${deckId}/make`)
    } catch (e) {
      setErr(`画像を読み込めませんでした（${(e as Error).message}）`)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <h2 className="font-semibold">1. 画像を選ぶ</h2>
        <p className="text-sm text-stone-500">SNS のスクショ、メニュー、看板、歌詞カードなど、韓国語が写っている画像。⌘V で貼り付けもできます。</p>
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]) }}
          className={`flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-sm ${drag ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/30' : 'border-stone-300 dark:border-stone-700'}`}
        >
          {preview ? <img src={preview} alt="選んだ画像" className="max-h-80 rounded-lg object-contain" /> : <>
            <span className="text-3xl">🖼️</span>
            <span>クリックして選ぶ／ドラッグ＆ドロップ／⌘V</span>
          </>}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {err && <p className="text-sm text-amber-700 dark:text-amber-400">{err}</p>}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">2. メモ（任意）</h2>
        <input className="input" placeholder="例: ◯◯のインスタのコメント" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex">
          <button className="btn-primary ml-auto" disabled={!file || busy} onClick={create}>{busy ? '準備中…' : 'この画像で解説とカードを作る →'}</button>
        </div>
      </section>
    </div>
  )
}
