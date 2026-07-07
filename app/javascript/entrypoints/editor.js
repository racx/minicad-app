/* Editor entrypoint — the only Vite-bundled page.
   Injects the MiniCAD engine UI verbatim (style + #app from the engine's own
   index.html — single source of truth, engine repo is read-only here), boots
   the engine, then runs the Rails persistence adapter:
     - server doc applied on boot
     - explicit save (button / Ctrl+S) + debounced autosave with dirty flag
       and a "saved HH:MM" indicator
     - CSRF-safe JSON, optimistic-lock conflict banner (reload / save-as-copy)
     - per-drawing localStorage crash net, reconciled on boot (newer wins)
   Anonymous /try mode boots the engine with its own localStorage autosave and
   shows a "sign in with Google to save" nudge instead. */
import engineHtml from '@minicad/engine/index.html?raw'
import { createEngine } from '@minicad/engine'
// /try starter canvas: the demo studio plan, straight from its MScript source
// (single source of truth — the same file the DB seeds execute)
import starterScript from '../../../db/seeds/drawings/01-studio-apartment.mscript?raw'

const mount = document.getElementById('editor-mount')
const cfg = mount.dataset
const anonymous = cfg.anonymous === 'true'

const ENGINE_AUTOSAVE_KEY = 'minicad.autosave'
const crashKey = anonymous ? null : `minicad.crash.${cfg.drawingId}`

/* ---------- shell chrome (adapter bar + banner), engine palette vars ---------- */
const shellCss = `
  body{display:flex;flex-direction:column}
  body #app{height:auto;flex:1;min-height:0}
  #saas-bar{display:flex;align-items:center;gap:10px;padding:5px 10px;background:var(--panel2);
    border-bottom:1px solid var(--line);font-family:var(--mono);font-size:12px;color:var(--dim)}
  #saas-bar a{color:var(--accent);text-decoration:none}
  #saas-bar a:hover{text-decoration:underline}
  #saas-bar .title{color:var(--text)}
  #saas-bar .spacer{flex:1}
  #saas-status{color:var(--dim)}
  #saas-status.dirty{color:var(--warn)}
  #saas-status.err{color:#ef7b7b}
  #saas-save{background:var(--panel);border:1px solid var(--line);color:var(--text);
    padding:3px 10px;border-radius:5px;cursor:pointer;font-family:var(--mono);font-size:12px}
  #saas-save:hover{border-color:var(--accent);color:var(--accent)}
  #saas-ai{background:var(--panel);border:1px solid var(--line);color:var(--text);
    padding:3px 10px;border-radius:5px;font-family:var(--mono);font-size:12px;width:240px}
  #saas-ai:focus{outline:none;border-color:var(--accent)}
  #saas-ai:disabled{opacity:.5}
  #saas-banner{position:absolute;top:0;left:50%;transform:translateX(-50%);z-index:20;
    margin-top:6px;max-width:640px;background:var(--panel);border:1px solid var(--warn);
    border-radius:8px;padding:10px 14px;font-family:var(--mono);font-size:12px;color:var(--text);
    display:flex;align-items:center;gap:10px;box-shadow:0 4px 24px rgba(0,0,0,.5)}
  #saas-banner button{background:var(--panel2);border:1px solid var(--line);color:var(--text);
    padding:3px 10px;border-radius:5px;cursor:pointer;font-family:var(--mono);font-size:12px}
  #saas-banner button:hover{border-color:var(--accent);color:var(--accent)}
`

function h(html) {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstChild
}

function injectEngine() {
  const doc = new DOMParser().parseFromString(engineHtml, 'text/html')
  const style = doc.querySelector('head style')
  document.head.appendChild(style.cloneNode(true))
  const css = document.createElement('style')
  css.textContent = shellCss
  document.head.appendChild(css)

  const bar = h(`<div id="saas-bar"></div>`)
  if (anonymous) {
    bar.appendChild(h(`<span class="title">MiniCAD — try it</span>`))
    bar.appendChild(h(`<span class="spacer"></span>`))
    bar.appendChild(h(`<span>Your work stays in this browser only.</span>`))
    bar.appendChild(h(`<a href="${cfg.signInUrl}">Sign in with Google to save</a>`))
  } else {
    bar.appendChild(h(`<a href="${cfg.drawingsUrl}">&larr; Drawings</a>`))
    const title = h(`<span class="title"></span>`)
    title.textContent = cfg.drawingTitle
    bar.appendChild(title)
    bar.appendChild(h(`<span class="spacer"></span>`))
    bar.appendChild(h(`<input id="saas-ai" type="text" placeholder="AI: draw a test square" aria-label="Ask the AI to draw">`))
    bar.appendChild(h(`<span id="saas-status">loading&hellip;</span>`))
    bar.appendChild(h(`<button id="saas-save" type="button">Save</button>`))
  }
  document.body.appendChild(bar)
  document.body.appendChild(doc.body.querySelector('#app').cloneNode(true))
}

/* ---------- boot ---------- */
let engine // { state, view, ui, face } — face bundle + dom adapter handles

async function boot() {
  injectEngine()

  // Authenticated mode drives the doc itself: never let the engine restore a
  // stale (possibly different-drawing) global autosave. /try keeps household
  // behavior — the engine restores and autosaves its own key untouched.
  if (!anonymous) localStorage.removeItem(ENGINE_AUTOSAVE_KEY)

  // The face is DOM-free; the dom adapter boots on import and must come
  // AFTER the engine markup is injected.
  const face = createEngine()
  const dom = await import('@minicad/engine/dom')
  engine = {
    face,
    state: face.state,
    view: { draw: dom.draw, zoomExtents: dom.zoomExtents, ctx: dom.ctx, w2s: dom.w2s },
    ui: { log: dom.log, refreshLayers: dom.refreshLayers }
  }

  if (anonymous){
    // first visit (no localStorage autosave restored): start with a copy of
    // the demo studio plan instead of an empty board
    if (!engine.state.entities.length){
      const r = engine.face.executeScript(starterScript)
      if (!r.errors.length){
        engine.view.zoomExtents()
        engine.ui.log('Loaded the demo studio plan to play with — type NEW to start fresh.', 'r')
      }
    }
  } else startAdapter()
}

/* ---------- Rails persistence adapter ---------- */
const POLL_MS = 1500          // dirty-check cadence
const QUIET_MS = 3000         // autosave after this much keyboard/mouse quiet
const MAX_UNSAVED_MS = 30000  // ... but never sit dirty longer than this
const RETRY_MS = 5000         // min gap between failed attempts

function serialize() {
  const { layers, entities, getIdSeq, units } = engine.state
  return JSON.stringify({ layers, entities, idSeq: getIdSeq(), units })
}

function applyDoc(d) {
  const { state, view, ui } = engine
  if (!d || (!d.entities?.length && !d.layers?.length)) {
    if (cfg.drawingUnits) state.setUnits(cfg.drawingUnits)
    view.draw()
    return
  }
  state.setLayers(d.layers || state.layers)
  state.setEntities(d.entities || [])
  state.setIdSeq(d.idSeq || (d.entities?.length || 0) + 1)
  state.setUnits(d.units || 'cm')
  state.setCurrentLayer(state.layers[0].name)
  ui.refreshLayers()
  state.selection.clear()
  view.zoomExtents()
  view.draw()
}

const statusEl = () => document.getElementById('saas-status')
function setStatus(text, cls = '') {
  const el = statusEl()
  el.textContent = text
  el.className = cls
}

let banner = null
function showBanner(text, actions) {
  hideBanner()
  banner = h(`<div id="saas-banner"></div>`)
  const span = document.createElement('span')
  span.textContent = text
  banner.appendChild(span)
  for (const [label, fn] of actions) {
    const b = h(`<button type="button"></button>`)
    b.textContent = label
    b.addEventListener('click', fn)
    banner.appendChild(b)
  }
  document.getElementById('stage').appendChild(banner)
}
function hideBanner() {
  banner?.remove()
  banner = null
}

let lockVersion, savedPayload, lastSeen, lastChangeAt, lastAttemptAt = 0, dirtySince = null
let saving = false, paused = false

function markSaved(payload, atIso) {
  savedPayload = payload
  dirtySince = null
  localStorage.removeItem(crashKey)
  const hhmm = new Date(atIso || Date.now()).toTimeString().slice(0, 5)
  setStatus(`saved ${hhmm}`)
}

async function save(payload) {
  if (saving || paused) return
  saving = true
  lastAttemptAt = Date.now()
  setStatus('saving…', 'dirty')
  try {
    const doc = JSON.parse(payload)
    const res = await fetch(cfg.autosaveUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
      },
      body: JSON.stringify({ doc, units: doc.units, lock_version: lockVersion })
    })
    if (res.status === 409) {
      paused = true
      setStatus('conflict', 'err')
      showBanner('This drawing was changed somewhere else. Saving here is paused so nothing gets overwritten.', [
        [ 'Reload their version', () => location.reload() ],
        [ 'Save mine as a copy', saveAsCopy ]
      ])
      return
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    lockVersion = data.lock_version
    markSaved(payload, data.saved_at)
  } catch {
    setStatus('save failed — retrying', 'err')
  } finally {
    saving = false
  }
}

async function saveAsCopy() {
  const doc = JSON.parse(serialize())
  const res = await fetch(cfg.copyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
    },
    body: JSON.stringify({ title: `${cfg.drawingTitle} (copy)`, units: doc.units, doc })
  })
  if (res.ok) {
    localStorage.removeItem(crashKey)
    const { edit_url } = await res.json()
    location.href = edit_url
  } else {
    setStatus('copy failed', 'err')
  }
}

function readCrashCopy() {
  try {
    const raw = localStorage.getItem(crashKey)
    if (!raw) return null
    const c = JSON.parse(raw)
    return c && c.doc && c.savedAt ? c : null
  } catch { return null }
}

function startAdapter() {
  const serverDoc = JSON.parse(document.getElementById('drawing-doc').textContent || '{}')
  lockVersion = Number(cfg.lockVersion)
  const serverAt = Date.parse(cfg.updatedAt)

  // Crash-net reconcile: newer wins, user informed (with an escape hatch —
  // server autosave stays paused until they choose or keep working).
  const crash = readCrashCopy()
  if (crash && Date.parse(crash.savedAt) > serverAt + 1500) {
    applyDoc(crash.doc)
    paused = true
    setStatus('restored unsaved changes', 'dirty')
    const hhmm = new Date(crash.savedAt).toTimeString().slice(0, 5)
    showBanner(`Restored unsaved local changes from ${hhmm} (newer than the server copy).`, [
      [ 'Keep them', () => { paused = false; hideBanner(); save(serialize()) } ],
      [ 'Discard — use server copy', () => {
          localStorage.removeItem(crashKey); paused = false; hideBanner()
          applyDoc(serverDoc); savedPayload = serialize(); lastSeen = savedPayload
          setStatus('server copy loaded')
        } ]
    ])
  } else {
    applyDoc(serverDoc)
    setStatus('loaded')
  }

  savedPayload = lastSeen = serialize()
  lastChangeAt = Date.now()

  setInterval(() => {
    const cur = serialize()
    if (cur !== lastSeen) {
      lastSeen = cur
      lastChangeAt = Date.now()
      if (paused && banner) { /* user kept editing on restored state: keep waiting for a banner choice */ }
    }
    const dirty = cur !== savedPayload
    if (!dirty) { dirtySince = null; return }
    dirtySince ??= Date.now()

    // crash net: mirror unsaved state, keyed per drawing
    try {
      localStorage.setItem(crashKey, JSON.stringify({ savedAt: new Date().toISOString(), doc: JSON.parse(cur) }))
    } catch { /* storage full/blocked — server autosave still runs */ }

    if (!saving && !paused) setStatus('unsaved changes', 'dirty')
    const quiet = Date.now() - lastChangeAt >= QUIET_MS
    const overdue = Date.now() - dirtySince >= MAX_UNSAVED_MS
    const retryOk = Date.now() - lastAttemptAt >= RETRY_MS
    if ((quiet || overdue) && retryOk) save(cur)
  }, POLL_MS)

  document.getElementById('saas-save').addEventListener('click', () => save(serialize()))
  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      save(serialize())
    }
  }, { capture: true })

  window.addEventListener('beforeunload', () => {
    const cur = serialize()
    if (cur !== savedPayload) {
      try {
        localStorage.setItem(crashKey, JSON.stringify({ savedAt: new Date().toISOString(), doc: JSON.parse(cur) }))
      } catch { /* best effort */ }
    }
  })

  startAiLoop()
}

/* ---------- AI commands: request → engine MScript validation → ghost → Enter/Esc ---------- */
let aiGhosts = null   // previewed entities awaiting commit
let aiScript = null   // the validated script, executed atomically on Enter
let aiClarify = null  // prior clarify round {request, question} — one round max

function startAiLoop() {
  const input = document.getElementById('saas-ai')

  input.addEventListener('keydown', async e => {
    if (e.key !== 'Enter' || aiGhosts) return
    e.stopPropagation()
    const request = input.value.trim()
    if (!request) return
    input.disabled = true
    setStatus('asking AI…', 'dirty')
    try {
      const res = await fetch(cfg.aiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
        },
        body: JSON.stringify({ request, context: engine.face.serializeContext(), clarify: aiClarify })
      })
      const data = await res.json().catch(() => ({}))
      if (data.status === 'ok' && data.script) {
        aiClarify = null
        const preview = engine.face.previewScript(data.script)
        if (preview.errors.length) {
          const e0 = preview.errors[0]
          engine.ui.log(`AI script rejected: ${e0.msg} (line ${e0.line}) — nothing was drawn.`, 'e')
          setStatus('AI script invalid', 'err')
        } else {
          aiScript = data.script
          startAiPreview(preview.entities, data.plan)
        }
      } else if (data.status === 'clarify' && data.question) {
        aiClarify = { request, question: data.question }   // the next message answers this
        engine.ui.log(`AI: ${data.question}`, 'e')
        setStatus('AI needs more', 'dirty')
      } else if (res.status === 429) {
        engine.ui.log(`AI: ${data.question || 'rate limit reached — try again in a minute.'}`, 'e')
        setStatus('AI rate-limited', 'err')
      } else {
        engine.ui.log('AI request failed — try again.', 'e')
        setStatus('AI failed', 'err')
      }
    } catch {
      engine.ui.log('AI request failed — are you offline?', 'e')
      setStatus('AI failed', 'err')
    } finally {
      input.disabled = false
      if (!aiGhosts) input.focus()
    }
  })
}

function startAiPreview(ghosts, plan) {
  aiGhosts = ghosts
  engine.ui.log(`AI plan: ${plan}  —  Enter to keep, Esc to discard.`, 'p')
  showBanner(`AI wants to draw: ${plan}`, [
    [ 'Keep (Enter)', commitAiPreview ],
    [ 'Discard (Esc)', cancelAiPreview ]
  ])
  window.addEventListener('keydown', aiPreviewKeys, { capture: true })
  requestAnimationFrame(aiOverlayTick)
}

function aiPreviewKeys(e) {
  if (!aiGhosts) return
  if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commitAiPreview() }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelAiPreview() }
}

function endAiPreview() {
  aiGhosts = null
  aiScript = null
  hideBanner()
  window.removeEventListener('keydown', aiPreviewKeys, { capture: true })
  engine.view.draw()
}

function commitAiPreview() {
  const script = aiScript
  const n = aiGhosts.length
  endAiPreview()
  const result = engine.face.executeScript(script)    // atomic, ONE undo entry
  if (result.errors.length) {
    const e0 = result.errors[0]
    engine.ui.log(`AI script failed: ${e0.msg} (line ${e0.line}) — nothing was drawn.`, 'e')
    setStatus('AI script invalid', 'err')
    return
  }
  engine.view.zoomExtents()
  engine.ui.log(`AI: drew ${result.created.length || n} object${(result.created.length || n) > 1 ? 's' : ''} — U to undo.`, 'r')
  document.getElementById('saas-ai').value = ''
}

function cancelAiPreview() {
  endAiPreview()
  engine.ui.log('AI preview discarded.', 'r')
}

// ghost overlay: engine redraws are event-driven; we stroke on top every frame
function aiOverlayTick() {
  if (!aiGhosts) return
  const { view } = engine
  const { ctx, w2s } = view
  ctx.save()
  ctx.strokeStyle = '#43d6b5'
  ctx.setLineDash([6, 5])
  ctx.globalAlpha = 0.9
  ctx.lineWidth = 1.4
  for (const g of aiGhosts) {
    ctx.beginPath()
    if (g.type === 'line') {
      const a = w2s({ x: g.x1, y: g.y1 }), b = w2s({ x: g.x2, y: g.y2 })
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
    } else if (g.type === 'circle') {
      const c = w2s({ x: g.cx, y: g.cy })
      ctx.arc(c.x, c.y, g.r * engine.state.view.scale, 0, Math.PI * 2)
    } else if (g.type === 'pline') {
      g.pts.forEach((p, i) => { const s = w2s(p); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y) })
      if (g.closed) ctx.closePath()
    }
    ctx.stroke()
  }
  ctx.restore()
  requestAnimationFrame(aiOverlayTick)
}

boot()
