#!/usr/bin/env node
// フレーズ暗記アプリの「お手伝いプログラム」。
// アプリから受け取ったプロンプトを Claude Code（claude -p）に渡し、答えを返す。
// このパソコンの中（127.0.0.1）からしか受け付けず、決まったアプリのページからの依頼だけに答える。
//
// 起動: node helper/server.mjs
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT || 8787)
const HOST = '127.0.0.1'
const VERSION = 2
const MODEL = process.env.CARD_MODEL || 'sonnet' // 使用量の少ない Sonnet を使う
const TIMEOUT_MS = 6 * 60 * 1000
const ALLOWED_ORIGINS = new Set([
  'https://ayana0011.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])
const MAX_BODY = 15 * 1024 * 1024 // 画像込みで 15MB まで
const HERE = dirname(fileURLToPath(import.meta.url))
const PY = join(HERE, '.venv', 'bin', 'python')

/** YouTube の URL から動画 ID を取り出す */
export function videoId(url) {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1, 12) || null
    if (/(^|\.)youtube\.com$/.test(u.hostname)) {
      if (u.searchParams.get('v')) return u.searchParams.get('v')
      const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})/)
      if (m) return m[1]
    }
  } catch { /* URL ではない */ }
  return /^[\w-]{11}$/.test(url) ? url : null
}

function runPython(id) {
  return new Promise((resolve, reject) => {
    if (!existsSync(PY)) return reject(new Error('YouTube 用の準備ができていません。ターミナルで sh ~/learningapp/helper/setup.sh を実行してください'))
    const child = spawn(PY, ['-I', join(HERE, 'yt_transcript.py'), id], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('字幕の取得に時間がかかりすぎました')) }, 60000)
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('close', () => {
      clearTimeout(timer)
      try {
        const data = JSON.parse(out)
        if (data.error) return reject(new Error(data.error))
        resolve(data)
      } catch { reject(new Error((err || '字幕を取れませんでした').slice(-300))) }
    })
  })
}

async function youtube({ url }) {
  const id = videoId(String(url || ''))
  if (!id) throw new Error('YouTube の動画の URL ではありません')
  const [subs, title] = await Promise.all([
    runPython(id),
    fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`)
      .then((r) => (r.ok ? r.json() : null)).then((j) => j && { title: j.title, author: j.author_name }).catch(() => null),
  ])
  return { id, url: `https://www.youtube.com/watch?v=${id}`, title: title?.title, author: title?.author, ...subs }
}

// 1件ずつ順番に処理する（同時に何本も Claude Code を動かさない）
let queue = Promise.resolve()
function enqueue(job) {
  const p = queue.then(job, job)
  queue = p.catch(() => {})
  return p
}

function runClaude(prompt, { allowRead = false, cwd }) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--model', MODEL, '--output-format', 'json', '--no-session-persistence']
    // 画像を読むときだけ Read を使えるようにする。それ以外の道具は使わせない
    args.push('--tools', allowRead ? 'Read' : '')
    if (allowRead) args.push('--allowedTools', 'Read')
    const child = spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: process.env })
    let out = ''
    let err = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('時間がかかりすぎたので止めました（6分）')) }, TIMEOUT_MS)
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(e.code === 'ENOENT' ? 'claude コマンドが見つかりません' : e.message)) })
    child.on('close', () => {
      clearTimeout(timer)
      let data
      try { data = JSON.parse(out) } catch { return reject(new Error((err || out || 'Claude Code から答えがありませんでした').slice(0, 500))) }
      if (data.is_error) {
        const msg = String(data.result || '')
        if (/401|login|authenticat|expired/i.test(msg)) return reject(new Error('Claude Code にログインし直してください（ターミナルで claude を起動して /login）'))
        if (/usage limit|rate limit|429/i.test(msg)) return reject(new Error('Claude の使用量の上限に達しました。時間をおいてください'))
        return reject(new Error(msg.slice(0, 500)))
      }
      resolve({ text: String(data.result || ''), ms: data.duration_ms })
    })
    child.stdin.end(prompt)
  })
}

async function generate({ prompt, image }) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('プロンプトが空です')
  // プロジェクトの設定などを読み込ませないよう、空の作業フォルダで動かす
  const dir = await mkdtemp(join(tmpdir(), 'phrase-helper-'))
  try {
    let full = prompt
    if (image) {
      const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/.exec(image)
      if (!m) throw new Error('画像の形式が読めません')
      const file = join(dir, `image.${m[1] === 'jpeg' ? 'jpg' : m[1]}`)
      await writeFile(file, Buffer.from(m[2], 'base64'))
      full = `次の画像ファイルを Read で開いて見てください: ${file}\n\n${prompt}`
    }
    return await runClaude(full, { allowRead: !!image, cwd: dir })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function send(res, status, body, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' }
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Vary'] = 'Origin'
  }
  res.writeHead(status, headers)
  res.end(JSON.stringify(body))
}

const server = createServer((req, res) => {
  const origin = req.headers.origin
  const allowed = origin && ALLOWED_ORIGINS.has(origin)
  if (!allowed) return send(res, 403, { error: 'このページからは使えません' })

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      // 公開ページ → このパソコン へのアクセスを Chrome に許可してもらう
      'Access-Control-Allow-Private-Network': 'true',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    })
    return res.end()
  }

  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, version: VERSION, model: MODEL }, origin)

  const routes = { '/generate': (b) => enqueue(() => generate(b)), '/youtube': youtube }
  if (req.method === 'POST' && routes[req.url]) {
    if (!/application\/json/.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'JSON で送ってください' }, origin)
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) { req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', async () => {
      let body
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return send(res, 400, { error: 'JSON が読めません' }, origin) }
      const started = Date.now()
      try {
        const r = await routes[req.url](body)
        console.log(`✓ ${new Date().toLocaleTimeString()} ${Math.round((Date.now() - started) / 1000)}秒${req.url === '/youtube' ? `（YouTube 字幕 ${r.lines.length} 行）` : body.image ? '（画像）' : ''}`)
        send(res, 200, r, origin)
      } catch (e) {
        console.log(`✗ ${new Date().toLocaleTimeString()} ${e.message}`)
        send(res, 500, { error: e.message }, origin)
      }
    })
    return
  }

  send(res, 404, { error: 'not found' }, origin)
})

// テストから読み込まれたときは起動しない
if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(PORT, HOST, () => {
  console.log(`フレーズ暗記のお手伝いプログラムが動いています: http://${HOST}:${PORT}（モデル: ${MODEL}）`)
  console.log('アプリの「Claude Code で自動作成」が使えます。止めるときは Ctrl+C')
})
