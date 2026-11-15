import type { StudyLog } from './types'

export type SyncAction = 'add' | 'update' | 'skip'

/** 同期ファイルの1件を、手元のデータと比べてどうするか決める（新しい方を残す） */
export function decide(local: { updatedAt?: number } | undefined, incoming: { updatedAt?: number }, deletedAt?: number): SyncAction {
  const inAt = incoming.updatedAt ?? 0
  if (deletedAt !== undefined && deletedAt >= inAt) return 'skip'
  if (!local) return 'add'
  return inAt > (local.updatedAt ?? 0) ? 'update' : 'skip'
}

/** 同じ日・同じ端末の学習記録は、大きい方を残す（何度同期しても増えない） */
export function mergeLog(local: StudyLog, incoming: StudyLog): StudyLog {
  return {
    ...local,
    seconds: Math.max(local.seconds, incoming.seconds),
    reviewed: Math.max(local.reviewed, incoming.reviewed),
    learned: Math.max(local.learned, incoming.learned),
  }
}

/** 日ごとに全端末の記録を合計 */
export function sumByDay(logs: StudyLog[]): Map<string, StudyLog> {
  const m = new Map<string, StudyLog>()
  for (const l of logs) {
    const cur = m.get(l.day)
    m.set(l.day, cur ? { ...cur, seconds: cur.seconds + l.seconds, reviewed: cur.reviewed + l.reviewed, learned: cur.learned + l.learned } : { ...l })
  }
  return m
}

export function newUid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try { return crypto.randomUUID() } catch { /* http の LAN アドレスなどでは使えない */ }
  }
  return 'u-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12)
}
