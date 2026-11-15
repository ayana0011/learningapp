import { HELPER_COMMAND } from '../lib/helper'

/** お手伝いプログラムが動いていないときの案内（パソコンだけ） */
export default function HelperHint({ ok }: { ok: boolean | null }) {
  if (ok !== false || /iPhone|iPad|Android/i.test(navigator.userAgent)) return null
  return (
    <details className="text-xs text-stone-500">
      <summary className="cursor-pointer">🤖 Claude Code で自動作成するには</summary>
      <p className="mt-1">ターミナルで次を実行してから、このページに戻ってください（コピペ作業が不要になります）。</p>
      <code className="mt-1 block rounded bg-stone-100 px-2 py-1 dark:bg-stone-800">{HELPER_COMMAND}</code>
    </details>
  )
}
