export type SourceKind = 'youtube' | 'live' | 'image' | 'other'

/** 字幕1行。t は元動画での秒数（不明なら undefined） */
export interface Line {
  t?: number
  end?: number
  text: string
  /** 併記されていた訳（tblfan の日本語訳など）。参考情報 */
  ja?: string
  /** 拡張でブックマークした行 */
  star?: boolean
}

export interface Source {
  id?: number
  title: string
  url?: string
  kind: SourceKind
  artist?: string
  lines: Line[]
  createdAt: number
  /** 画像から作った場合の画像（縮小した JPEG） */
  image?: Blob
  /** 画像の解説 */
  note?: ImageNote
}

export interface ImageNote {
  /** 画像に書かれている韓国語（書き起こし） */
  text: string
  /** 全体の日本語訳 */
  ja: string
  /** 文法・表現・背景の解説 */
  notes: string[]
}

export interface Word {
  k: string
  j: string
  p: string
  b?: string
}

/** AI が返すフレーズ（短い項目名で出力量を節約） */
export interface GeneratedItem {
  k: string
  j: string
  p: string
  t?: number
  w: Word[]
}

export interface Deck {
  id?: number
  sourceId: number
  title: string
  /** 使った行の範囲 [start, end)（lines の index） */
  range: [number, number]
  createdAt: number
}

export interface Review {
  /** 次に出す時刻 (ms) */
  due: number
  /** 間隔の段階 0=未学習 */
  stage: number
  reps: number
  lastResult?: Grade
}

export type Grade = 'again' | 'ok' | 'good'

export interface PhraseCard extends Review {
  id?: number
  deckId: number
  order: number
  k: string
  j: string
  p: string
  t?: number
  w: Word[]
}

export interface StudyLog {
  id?: number
  day: string // YYYY-MM-DD
  seconds: number
  reviewed: number
  learned: number
}

/** 単語デッキに入る例文 */
export interface WordExample {
  sentence: string
  ja?: string
  deckId?: number
}

/** 単語デッキのカード（辞書形 base で1枚にまとめる） */
export interface WordCard extends Review {
  id?: number
  base: string
  k: string
  j: string
  p: string
  examples: WordExample[]
  createdAt: number
}
