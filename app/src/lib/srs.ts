import type { Grade, Review } from './types'

const DAY = 24 * 60 * 60 * 1000
/** 段階ごとの間隔（日）: 1日→3日→7日→14日→30日→60日 */
export const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60]

/** 「完璧でなくても先へ進む」軽めの間隔反復 */
export function nextReview(r: Review, grade: Grade, now = Date.now()): Review {
  const max = INTERVAL_DAYS.length - 1
  let stage: number
  if (grade === 'again') stage = Math.max(0, r.stage - 1)
  // 「だいたいOK」は段階を据え置き（初回だけ1日後へ）
  else if (grade === 'ok') stage = Math.max(1, r.stage)
  // 「覚えた」は1段進める（初回は3日後へ）
  else stage = Math.min(max, r.stage === 0 ? 2 : r.stage + 1)
  const due = grade === 'again' ? now : now + INTERVAL_DAYS[stage] * DAY
  return { stage, due, reps: r.reps + 1, lastResult: grade }
}

export function isLearned(r: Review): boolean {
  return r.stage >= 2
}

export function dayKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/**
 * セッション内の出題キュー。「もう一回」は数枚後に再出題する。
 * 返り値は次のキュー（先頭が次に出すカード）。
 */
export function requeue<T>(queue: T[], current: T, grade: Grade, gap = 4): T[] {
  const rest = queue.filter((c) => c !== current)
  if (grade !== 'again') return rest
  const at = Math.min(gap, rest.length)
  return [...rest.slice(0, at), current, ...rest.slice(at)]
}
