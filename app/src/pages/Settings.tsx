import { useState } from 'react'
import { exportSync, importSync } from '../db/db'
import { deviceId, useSettings } from '../lib/settings'

export default function SettingsPage() {
  const [s, set] = useSettings()
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function share() {
    setBusy(true)
    setMsg('')
    try {
      const data = await exportSync()
      const name = `phrase-sync-${data.exportedAt.slice(0, 16).replace(/[-:T]/g, '')}-${data.device}.json`
      const file = new File([JSON.stringify(data)], name, { type: 'application/json' })
      // スマホは共有シート（AirDrop など）、パソコンはダウンロード
      if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
        await navigator.share({ files: [file], title: 'フレーズ暗記の同期ファイル' })
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(file)
        a.download = name
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      }
      setMsg(`書き出しました（カード ${data.cards.length} 枚・単語 ${data.words.length} 語）`)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg(`書き出せませんでした: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function merge(f: File) {
    setBusy(true)
    setMsg('')
    try {
      const r = await importSync(JSON.parse(await f.text()))
      setMsg(`合わせました: 追加 ${r.added} ・ 更新 ${r.updated} ・ 削除 ${r.removed}`)
    } catch (e) {
      setMsg(`読み込めませんでした: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">設定</h1>
      <section className="card space-y-3 text-sm">
        <label className="flex items-center justify-between gap-3">
          カードの表に出す言語
          <select className="input w-40" value={s.front} onChange={(e) => set({ front: e.target.value as 'ja' | 'ko' })}>
            <option value="ja">日本語</option>
            <option value="ko">韓国語</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-3">
          1回の暗記で出す新しいカードの上限
          <input type="number" min={5} max={200} className="input w-24" value={s.newPerSession} onChange={(e) => set({ newPerSession: Number(e.target.value) || 40 })} />
        </label>
        <label className="flex items-center justify-between gap-3">
          取り込み時に相づちだけの行を除く
          <input type="checkbox" checked={s.dropFillers} onChange={(e) => set({ dropFillers: e.target.checked })} />
        </label>
      </section>

      <section className="card space-y-3 text-sm">
        <h2 className="font-semibold">目標</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input type="number" min={1} max={60} className="input w-20" value={s.goalDays} onChange={(e) => set({ goalDays: Number(e.target.value) || 14 })} />
          日で
          <input type="number" min={10} step={10} className="input w-24" value={s.goalWords} onChange={(e) => set({ goalWords: Number(e.target.value) || 1000 })} />
          語を覚える
        </div>
        <div className="flex items-center gap-3">
          <span className="text-stone-500">{s.goalStart ? `開始日: ${new Date(s.goalStart).toLocaleDateString('ja-JP')}` : 'まだ始めていません'}</span>
          <button className="btn-ghost ml-auto" onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); set({ goalStart: d.getTime() }) }}>今日から始める</button>
        </div>
        <p className="text-xs text-stone-500">覚えた単語＝単語デッキで「覚えた」になった単語＋覚えたフレーズに入っている単語（重複は1つ）</p>
      </section>

      <section className="card space-y-3 text-sm">
        <h2 className="font-semibold">パソコン ⇄ スマホの同期・バックアップ</h2>
        <p className="text-stone-500">
          データはこのブラウザの中だけにあります。片方で「書き出す」→ もう片方で「読み込んで合わせる」と、両方の内容が合わさります（新しい方が残り、消したものは消えたまま）。書き出したファイルはバックアップにもなります。
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-stone-500">
          <li>パソコンでカードを作ったら「書き出す」→ AirDrop でスマホへ</li>
          <li>スマホで「読み込んで合わせる」→ 届いたファイルを選ぶ（「ファイル」アプリのダウンロード）</li>
          <li>スマホで暗記した記録をパソコンにも反映したいときは、逆向きに同じことをする</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy} onClick={share}>同期ファイルを書き出す</button>
          <label className={`btn-ghost ${busy ? 'pointer-events-none opacity-40' : ''}`}>
            読み込んで合わせる
            <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) merge(f) }} />
          </label>
        </div>
        {msg && <p>{msg}</p>}
        <p className="text-xs text-stone-400">この端末: {deviceId()}</p>
      </section>
    </div>
  )
}
