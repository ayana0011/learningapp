import { useState } from 'react'
import { exportAll, importAll } from '../db/db'
import { useSettings } from '../lib/settings'

export default function SettingsPage() {
  const [s, set] = useSettings()
  const [msg, setMsg] = useState('')

  async function download() {
    const data = await exportAll()
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `phrase-flashcards-${data.exportedAt.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function restore(f: File) {
    if (!confirm('今のデータをすべて置き換えます。よろしいですか？')) return
    try {
      await importAll(JSON.parse(await f.text()))
      setMsg('読み込みました')
    } catch (e) {
      setMsg(`読み込めませんでした: ${(e as Error).message}`)
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
        <h2 className="font-semibold">バックアップ</h2>
        <p className="text-stone-500">データはこのブラウザの中だけに保存されています。ときどき書き出しておくと安心です。</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={download}>JSON で書き出す</button>
          <label className="btn-ghost">
            JSON から読み込む
            <input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
          </label>
        </div>
        {msg && <p>{msg}</p>}
      </section>
    </div>
  )
}
