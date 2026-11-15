import { describe, expect, it } from 'vitest'
import { decide, mergeLog, newUid, sumByDay } from './sync'

describe('sync', () => {
  it('decide: 新しい方を残す', () => {
    expect(decide(undefined, { updatedAt: 5 })).toBe('add')
    expect(decide({ updatedAt: 5 }, { updatedAt: 9 })).toBe('update')
    expect(decide({ updatedAt: 9 }, { updatedAt: 5 })).toBe('skip')
    expect(decide({ updatedAt: 5 }, { updatedAt: 5 })).toBe('skip')
  })
  it('decide: 消したものは、消した後に変更されていなければ戻さない', () => {
    expect(decide(undefined, { updatedAt: 5 }, 7)).toBe('skip')
    expect(decide(undefined, { updatedAt: 9 }, 7)).toBe('add')
  })
  it('mergeLog は大きい方（何度同期しても増えない）', () => {
    const a = { day: '2026-11-15', device: 'pc', seconds: 600, reviewed: 20, learned: 3 }
    const b = { ...a, seconds: 900, reviewed: 10 }
    expect(mergeLog(a, b)).toMatchObject({ seconds: 900, reviewed: 20, learned: 3 })
    expect(mergeLog(mergeLog(a, b), b)).toMatchObject({ seconds: 900 })
  })
  it('sumByDay は端末をまたいで合計', () => {
    const m = sumByDay([
      { day: 'd1', device: 'pc', seconds: 60, reviewed: 1, learned: 0 },
      { day: 'd1', device: 'phone', seconds: 120, reviewed: 2, learned: 1 },
      { day: 'd2', device: 'phone', seconds: 30, reviewed: 1, learned: 0 },
    ])
    expect(m.get('d1')).toMatchObject({ seconds: 180, reviewed: 3, learned: 1 })
    expect(m.size).toBe(2)
  })
  it('newUid は毎回違う', () => {
    expect(newUid()).not.toBe(newUid())
  })
})
