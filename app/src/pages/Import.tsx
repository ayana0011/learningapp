import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { artistFromSlug, replayToLines, requestReplay, type ReplayRecord } from '../lib/extension'
import { addWord, db } from '../db/db'
import { cleanLines, formatClock, parsePastedText, parseSubtitleFile, suggestRanges } from '../lib/parse'
import type { Line, SourceKind } from '../lib/types'
import { useSettings } from '../lib/settings'
import ImageImport from '../components/ImageImport'
import ClaudePaste from '../components/ClaudePaste'

const KINDS: { v: SourceKind; label: string }[] = [
  { v: 'youtube', label: 'YouTube' },
  { v: 'live', label: 'ライブ配信' },
  { v: 'other', label: 'その他' },
]

export default function ImportPage() {
  const nav = useNavigate()
  const [settings, setSettings] = useSettings()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<SourceKind>('youtube')
  const [artist, setArtist] = useState('')
  const [raw, setRaw] = useState('')
  const [fileLines, setFileLines] = useState<Line[] | null>(null)
  const [range, setRange] = useState<[number, number] | null>(null)
  const [params] = useSearchParams()
  const replayId = params.get('from') === 'tblfan' ? params.get('replay') : null
  const [extMsg, setExtMsg] = useState('')
  const [extWords, setExtWords] = useState<NonNullable<ReplayRecord['words']>>([])
  const [mode, setMode] = useState<'text' | 'image' | 'claude'>((['image', 'claude'] as const).find((m) => m === params.get('mode')) ?? 'text')

  // tblfan 拡張から「暗記アプリに送る」で開かれた場合
  useEffect(() => {
    if (!replayId) return
    setExtMsg('拡張から字幕を受け取っています…')
    requestReplay(replayId).then((r) => {
      if (!r) { setExtMsg('拡張から受け取れませんでした。拡張が入っているか、アプリの URL が拡張の設定と同じか確認してください。'); return }
      setKind('live')
      setTitle(r.title)
      setUrl(r.url)
      setArtist(artistFromSlug(r.artist))
      setFileLines(replayToLines(r))
      setRange(null)
      const stars = r.lines.filter((l) => l.star).length
      setExtWords(r.words ?? [])
      const nw = r.words?.length ?? 0
      setExtMsg(`拡張から ${r.lines.length} 行を受け取りました${stars ? `（☆ ${stars}）` : ''}${nw ? `。保存した単語 ${nw} 語はデッキを作ると単語デッキに入ります` : ''}`)
    })
  }, [replayId])

  const lines = useMemo(() => {
    const parsed = fileLines ?? parsePastedText(raw)
    return cleanLines(parsed, { dropFillers: settings.dropFillers })
  }, [raw, fileLines, settings.dropFillers])
  const chunks = useMemo(() => suggestRanges(lines), [lines])
  const sel: [number, number] = range ?? (chunks.length > 1 ? chunks[0] : [0, lines.length])
  const selected = lines.slice(sel[0], sel[1])

  async function onFile(f: File) {
    const text = await f.text()
    setFileLines(/-->/.test(text) ? parseSubtitleFile(text) : parsePastedText(text))
    if (!title) setTitle(f.name.replace(/\.(srt|vtt|txt)$/i, ''))
    setRange(null)
  }

  async function create() {
    const now = Date.now()
    const sourceId = await db.sources.add({ title: title || '無題', url: url || undefined, kind, artist: artist || undefined, lines, createdAt: now })
    const label = chunks.length > 1 ? ` ${formatClock(lines[sel[0]]?.t)}〜` : ''
    for (const w of extWords) {
      // 辞書形は単語デッキの「意味づけ」で Claude に直してもらう
      await addWord({ k: w.ko, j: w.ja || '', p: '' }, w.sentence ? { sentence: w.sentence } : undefined)
    }
    const deckId = await db.decks.add({ sourceId: sourceId!, title: (title || '無題') + label, range: sel, createdAt: now })
    nav(`/deck/${deckId}/make`)
  }

  const modeTabs = (
    <div className="flex items-center gap-2">
      <h1 className="mr-auto text-xl font-bold">取り込む</h1>
      <button className={mode === 'text' ? 'btn-primary' : 'btn-ghost'} onClick={() => setMode('text')}>📝 字幕</button>
      <button className={mode === 'image' ? 'btn-primary' : 'btn-ghost'} onClick={() => setMode('image')}>🖼️ 画像</button>
      <button className={mode === 'claude' ? 'btn-primary' : 'btn-ghost'} onClick={() => setMode('claude')}>💬 Claude</button>
    </div>
  )

  if (mode === 'image') return <div className="space-y-6">{modeTabs}<ImageImport /></div>
  if (mode === 'claude') return <div className="space-y-6">{modeTabs}<ClaudePaste /></div>

  return (
    <div className="space-y-6">
      {modeTabs}
      {extMsg && <p className="card text-sm">{extMsg}</p>}

      <section className="card space-y-3">
        <h2 className="font-semibold">1. 素材の情報</h2>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button key={k.v} onClick={() => setKind(k.v)} className={kind === k.v ? 'btn-primary' : 'btn-ghost'}>{k.label}</button>
          ))}
        </div>
        <input className="input" placeholder="タイトル（例: 카페 vlog）" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="input" placeholder="元のURL（任意）" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input className="input" placeholder="アーティスト・チャンネル名（任意）" value={artist} onChange={(e) => setArtist(e.target.value)} />
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">2. 字幕を貼り付け／ファイルを選ぶ</h2>
        <p className="text-sm text-stone-500">YouTube: 概要欄の「文字起こしを表示」→ 全部選択してコピー → ここに貼り付け</p>
        <textarea
          className="input h-48 font-mono ko"
          placeholder={'0:03\n안녕하세요 여러분\n0:07\n오늘은 카페에 왔어요'}
          value={raw}
          onChange={(e) => { setRaw(e.target.value); setFileLines(null); setRange(null) }}
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="btn-ghost">
            .srt / .vtt / .txt を選ぶ
            <input type="file" accept=".srt,.vtt,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          {fileLines && <span className="text-stone-500">{replayId ? '拡張' : 'ファイル'}から {fileLines.length} 行</span>}
          <label className="ml-auto flex items-center gap-2">
            <input type="checkbox" checked={settings.dropFillers} onChange={(e) => setSettings({ dropFillers: e.target.checked })} />
            相づちだけの行（아. 네. など）を除く
          </label>
        </div>
      </section>

      {lines.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-semibold">3. 使う範囲を選ぶ <span className="text-sm font-normal text-stone-500">（全 {lines.length} 行）</span></h2>
          {chunks.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {chunks.map((c, i) => (
                <button key={i} onClick={() => setRange(c)} className={sel[0] === c[0] && sel[1] === c[1] ? 'btn-primary' : 'btn-ghost'}>
                  {lines[c[0]].t !== undefined ? `${formatClock(lines[c[0]].t)}〜` : `${c[0] + 1}行〜`}（{c[1] - c[0]}行）
                </button>
              ))}
              <button onClick={() => setRange([0, lines.length])} className="btn-ghost">全部</button>
            </div>
          )}
          <p className="text-xs text-stone-500">行をクリックすると開始、Shift+クリックで終了を指定できます。</p>
          <ol className="max-h-80 overflow-y-auto rounded-lg border border-stone-200 text-sm dark:border-stone-800">
            {lines.map((l, i) => {
              const inSel = i >= sel[0] && i < sel[1]
              return (
                <li
                  key={i}
                  onClick={(e) => setRange(e.shiftKey ? [sel[0], Math.max(sel[0] + 1, i + 1)] : [i, Math.max(i + 1, sel[1])])}
                  className={`flex cursor-pointer gap-3 border-b border-stone-100 px-3 py-1.5 last:border-0 dark:border-stone-800 ${inSel ? 'bg-rose-50 dark:bg-rose-950/40' : 'opacity-50'}`}
                >
                  <span className="w-14 shrink-0 text-right font-mono text-xs text-stone-400">{formatClock(l.t)}</span>
                  <span className="ko">{l.star && '★ '}{l.text}{l.ja && <span className="block text-xs text-stone-500">{l.ja}</span>}</span>
                </li>
              )
            })}
          </ol>
          <div className="flex items-center gap-3">
            <span className="text-sm">選択中: {selected.length} 行</span>
            <button className="btn-primary ml-auto" disabled={!selected.length} onClick={create}>この範囲でデッキを作る →</button>
          </div>
        </section>
      )}
    </div>
  )
}
