#!/usr/bin/env node
/* Eval harness: hits the LIVE endpoint (dev server + whatever model AI_* points
   at), applies returned scripts locally through the engine face, and grades
   entity assertions at 0.05 tolerance. Baseline, not gate — failures are data.

   Usage: node evals/run.mjs [--base http://localhost:3000] [--label modelname]
   Writes evals/results/<date>-<label>.md and prints the table. */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createEngine } from '@minicad/engine'

const args = process.argv.slice(2)
const opt = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt }
const BASE = opt('--base', 'http://localhost:3000')
const LABEL = opt('--label', process.env.AI_MODEL || 'unknown-model')
const TOL = 0.05
const EVAL_USER = `evals@minicad.local`

const engine = createEngine()
const S = engine.state

/* ---------- tiny cookie-jar HTTP ---------- */
const jar = new Map()
function cookieHeader(){ return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ') }
function eatCookies(res){
  for (const c of res.headers.getSetCookie?.() || []){
    const [pair] = c.split(';')
    const [k, ...v] = pair.split('=')
    jar.set(k.trim(), v.join('='))
  }
}
async function http(path, init = {}){
  const res = await fetch(BASE + path, { redirect: 'manual', ...init,
    headers: { Cookie: cookieHeader(), ...(init.headers || {}) } })
  eatCookies(res)
  return res
}

async function signIn(){
  let res = await http('/users/sign_in')
  const html = await res.text()
  const m = html.match(/action="\/users\/auth\/developer".*?name="authenticity_token" value="([^"]*)"/s)
  if (!m) throw new Error('developer sign-in form not found — is this a dev server?')
  res = await http('/users/auth/developer', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ authenticity_token: m[1] }) })
  await http(`/users/auth/developer/callback?email=${encodeURIComponent(EVAL_USER)}`)
  res = await http('/drawings')
  const dash = await res.text()
  const tok = dash.match(/name="csrf-token" content="([^"]*)"/)
  if (!tok) throw new Error('sign-in failed (no csrf meta on dashboard)')
  return tok[1]
}

/* ---------- doc loading + assertions ---------- */
function loadDoc(doc){
  S.setLayers(JSON.parse(JSON.stringify(doc.layers || [{ name: '0', color: '#e8e8e8' }])))
  S.setEntities(JSON.parse(JSON.stringify(doc.entities || [])))
  S.setIdSeq(doc.idSeq || S.entities.length + 1)
  S.setUnits(doc.units || 'cm')
  S.setCurrentLayer(S.layers[0].name)
  S.selection.clear(); S.undoStack.length = 0
}
function docFromSeed(path){
  loadDoc({ layers: [
    { name: '0', color: '#e8e8e8' }, { name: 'walls', color: '#4db8ff' },
    { name: 'furniture', color: '#f2b950' }, { name: 'annot', color: '#ef7b7b' } ] })
  const r = engine.executeScript(readFileSync(path, 'utf8'))
  if (r.errors.length) throw new Error(`seed script failed: ${JSON.stringify(r.errors[0])}`)
  return snapshotDoc()
}
function snapshotDoc(){
  return JSON.parse(JSON.stringify({ layers: S.layers, entities: S.entities, idSeq: S.getIdSeq(), units: S.units }))
}

const near = (a, b) => Math.abs(a - b) <= TOL
function matchProps(e, props){
  return Object.entries(props).every(([k, v]) =>
    typeof v === 'number' ? typeof e[k] === 'number' && near(e[k], v) : e[k] === v)
}
function bboxOf(e){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const eat = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  if (e.type === 'line'){ eat(e.x1, e.y1); eat(e.x2, e.y2) }
  else if (e.type === 'circle'){ eat(e.cx - e.r, e.cy - e.r); eat(e.cx + e.r, e.cy + e.r) }
  else if (e.type === 'pline') for (const p of e.pts) eat(p.x, p.y)
  return [x0, y0, x1, y1]
}
function hatchArea(h, ents){
  const b = ents.find(z => z.id === h.ref)
  if (!b) return null
  // shoelace is enough for the eval fixtures (rect regions)
  if (b.type === 'circle') return Math.PI * b.r * b.r
  let a = 0
  const pts = b.pts
  for (let i = 0; i < pts.length; i++){
    const p = pts[i], q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

function grade(fix, before, after, response){
  const failures = []
  const want = fix.expect
  if (want.status === 'clarify'){
    if (response.status !== 'clarify') failures.push(`expected clarify, got ${response.status}`)
  } else if (response.status !== 'ok'){
    failures.push(`expected ok, got ${response.status}${response.question ? ` (“${response.question}”)` : ''}`)
  }
  for (const a of want.asserts || []){
    const ents = after
    const pool = a.where ? ents.filter(e => matchProps(e, a.where)) : ents
    switch (a.kind){
      case 'untouched':
        if (JSON.stringify(before) !== JSON.stringify(after)) failures.push('drawing was modified')
        break
      case 'unchanged': {
        const b = before.find(e => e.id === a.id), c = after.find(e => e.id === a.id)
        if (JSON.stringify(b) !== JSON.stringify(c)) failures.push(`#${a.id} changed`)
        break
      }
      case 'moved': {
        const b = before.find(e => e.id === a.id), c = after.find(e => e.id === a.id)
        if (!b || !c){ failures.push(`#${a.id} missing`); break }
        const [bx, by] = bboxOf(b), [cx, cy] = bboxOf(c)
        if (!near(cx - bx, a.dx) || !near(cy - by, a.dy))
          failures.push(`#${a.id} moved (${(cx-bx).toFixed(2)},${(cy-by).toFixed(2)}) not (${a.dx},${a.dy})`)
        break
      }
      case 'count':
        if (pool.length !== a.equals) failures.push(`count(${JSON.stringify(a.where)})=${pool.length}, want ${a.equals}`)
        break
      case 'entity':
        if (a.props && !pool.some(e => matchProps(e, a.props)))
          failures.push(`no entity matching ${JSON.stringify(a.props)}`)
        if (a.bboxIs && !pool.some(e => bboxOf(e).every((v, i) => near(v, a.bboxIs[i]))))
          failures.push(`no entity with bbox ${JSON.stringify(a.bboxIs)}`)
        break
      case 'noEntity':
        if (pool.some(e => matchProps(e, a.props))) failures.push(`forbidden entity matching ${JSON.stringify(a.props)}`)
        break
      case 'bbox': {
        const hit = pool.some(e => bboxOf(e).every((v, i) => near(v, a.box[i])))
        if (!hit) failures.push(`no ${JSON.stringify(a.where)} with bbox ${JSON.stringify(a.box)}`)
        break
      }
      case 'hatch': {
        const h = ents.find(e => e.type === 'hatch' && e.mat === a.material && (!a.ref || e.ref === a.ref))
        if (!h) failures.push(`no ${a.material} hatch${a.ref ? ` on #${a.ref}` : ''}`)
        break
      }
      case 'hatchByArea': {
        const h = ents.filter(e => e.type === 'hatch')
          .find(e => { const ar = hatchArea(e, ents); return ar && Math.abs(ar - a.areaAbout) < a.areaAbout * 0.02 })
        if (!h) failures.push(`no hatch with area ≈${a.areaAbout}`)
        else if (h.mat !== a.material) failures.push(`hatch(≈${a.areaAbout}) is ${h.mat}, want ${a.material}`)
        break
      }
      default: failures.push(`unknown assert kind ${a.kind}`)
    }
  }
  return failures
}

/* ---------- main ---------- */
const csrf = await signIn()
const files = readdirSync('evals/fixtures').filter(f => f.endsWith('.mjs')).sort()
const results = []
console.log(`evals → ${BASE} · label ${LABEL} · ${files.length} fixtures\n`)

for (const f of files){
  const fix = (await import(`./fixtures/${f}`)).default
  const doc = fix.seedScript ? docFromSeed(fix.seedScript) : fix.doc
  loadDoc(doc)
  const context = engine.serializeContext()
  const before = JSON.parse(JSON.stringify(S.entities))

  const create = await http('/drawings', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify({ title: `eval ${fix.name} ${Date.now()}`, units: doc.units || 'cm', doc }) })
  if (create.status !== 201){ console.log(`✗ ${fix.name}: drawing create failed ${create.status}`); process.exit(1) }
  const { id } = await create.json()

  const t0 = Date.now()
  const res = await http(`/api/drawings/${id}/ai_commands`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify({ request: fix.request, context }) })
  const body = await res.json().catch(() => ({}))
  const secs = ((Date.now() - t0) / 1000).toFixed(1)

  let after = before
  if (body.status === 'ok' && body.script){
    loadDoc(doc)
    const r = engine.executeScript(body.script)
    if (r.errors.length){ // endpoint validated it, so this indicates doc drift — treat as failure
      results.push({ fix, body, secs, failures: [`script failed locally: ${JSON.stringify(r.errors[0])}`] })
      continue
    }
    after = JSON.parse(JSON.stringify(S.entities))
  }
  const failures = grade(fix, before, after, body)
  results.push({ fix, body, secs, failures })
  console.log(`${failures.length ? '✗' : '✓'} ${fix.name} (${secs}s, ${body.status})${failures.length ? ' — ' + failures[0] : ''}`)
  await new Promise(r => setTimeout(r, 6500))   // stay under the 10/min throttle
}

/* ---------- report ---------- */
const passed = results.filter(r => !r.failures.length).length
const date = new Date().toISOString().slice(0, 10)
let md = `# Eval run — ${LABEL}\n\n${date} · endpoint ${BASE} · **${passed}/${results.length} passed** · tolerance ${TOL}\n\n`
for (const r of results){
  md += `## ${r.failures.length ? '✗' : '✓'} ${r.fix.name} (${r.secs}s)\n\n`
  md += `- request: “${r.fix.request}”\n- status: ${r.body.status}\n`
  if (r.body.script) md += `- script:\n\n\`\`\`\n${r.body.script}\n\`\`\`\n`
  if (r.body.question) md += `- question: “${r.body.question}”\n`
  for (const f of r.failures) md += `- **FAIL**: ${f}\n`
  md += '\n'
}
mkdirSync('evals/results', { recursive: true })
const out = `evals/results/${date}-${LABEL.replace(/[^\w.-]+/g, '_')}.md`
writeFileSync(out, md)
console.log(`\n${passed}/${results.length} passed → ${out}`)
