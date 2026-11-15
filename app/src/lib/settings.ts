import { useState } from 'react'

export interface Settings {
  front: 'ja' | 'ko'
  dropFillers: boolean
  newPerSession: number
  goalWords: number
  goalDays: number
  /** 目標を始めた日 (ms) */
  goalStart: number
}

const DEFAULTS: Settings = { front: 'ja', dropFillers: true, newPerSession: 40, goalWords: 1000, goalDays: 14, goalStart: 0 }
const KEY = 'phrase-flashcards-settings'

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return DEFAULTS
  }
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [s, set] = useState(loadSettings)
  const update = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch }
    set(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* 保存できなくても動く */ }
  }
  return [s, update]
}

/** 韓国語の読み上げ（ブラウザ内蔵） */
export function speakKo(text: string, rate = 0.9) {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ko-KR'
  u.rate = rate
  const v = speechSynthesis.getVoices().find((x) => x.lang.startsWith('ko'))
  if (v) u.voice = v
  speechSynthesis.speak(u)
}

export function youtubeAt(url: string | undefined, t: number | undefined): string | undefined {
  if (!url || t === undefined) return undefined
  try {
    const u = new URL(url)
    if (!/youtube\.com|youtu\.be/.test(u.hostname)) return undefined
    u.searchParams.set('t', `${Math.max(0, Math.floor(t) - 1)}s`)
    return u.toString()
  } catch {
    return undefined
  }
}

const DEVICE_KEY = 'phrase-flashcards-device'
let cachedDevice = ''
/** この端末の ID（学習記録を端末ごとに分けるため） */
export function deviceId(): string {
  if (cachedDevice) return cachedDevice
  try {
    cachedDevice = localStorage.getItem(DEVICE_KEY) || ''
    if (!cachedDevice) {
      cachedDevice = (/iPhone|iPad|Android/i.test(navigator.userAgent) ? 'phone-' : 'pc-') + Math.random().toString(36).slice(2, 8)
      localStorage.setItem(DEVICE_KEY, cachedDevice)
    }
  } catch {
    cachedDevice ||= 'dev-' + Math.random().toString(36).slice(2, 8)
  }
  return cachedDevice
}
