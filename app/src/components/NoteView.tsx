import type { ImageNote } from '../lib/types'

/** 画像の解説（書き起こし・訳・ポイント） */
export default function NoteView({ note, open = true }: { note: ImageNote; open?: boolean }) {
  return (
    <details open={open} className="card space-y-3 text-sm">
      <summary className="cursor-pointer font-semibold">解説</summary>
      {note.text && <p className="ko mt-3 whitespace-pre-wrap rounded-lg bg-stone-100 p-3 text-base dark:bg-stone-800">{note.text}</p>}
      {note.ja && <p className="whitespace-pre-wrap">{note.ja}</p>}
      {note.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5">
          {note.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
    </details>
  )
}
