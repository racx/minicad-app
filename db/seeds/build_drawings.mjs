#!/usr/bin/env node
/* Seed builder: authors NOTHING by hand — every demo drawing is an MScript
   file executed through the engine package face. Emits one JSON document per
   drawing (stdout) for db/seeds.rb to upsert, and writes an SVG preview per
   drawing to tmp/seed-previews/ for eyeballing.

   Any script error (parse, selector, engine refusal) ABORTS the whole run
   with the line-numbered error — broken demos must never land. */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createEngine } from '@minicad/engine'

const DIR = 'db/seeds/drawings'
const PREVIEWS = 'tmp/seed-previews'
const engine = createEngine()
const S = engine.state

const DEFAULT_LAYERS = JSON.parse(JSON.stringify(S.layers))
function reset(){
  S.setEntities([])
  S.setLayers(JSON.parse(JSON.stringify(DEFAULT_LAYERS)))
  S.setCurrentLayer('0')
  S.setIdSeq(1)
  S.setUnits('cm')
  S.selection.clear()
  S.undoStack.length = 0
  S.redoStack.length = 0
}

// rough drawing extents — good enough to frame a preview sheet
function bbox(){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const eat = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  for (const e of S.entities){
    if (e.type === 'line'){ eat(e.x1, e.y1); eat(e.x2, e.y2) }
    else if (e.type === 'circle' || e.type === 'arc'){ eat(e.cx - e.r, e.cy - e.r); eat(e.cx + e.r, e.cy + e.r) }
    else if (e.type === 'pline') for (const p of e.pts) eat(p.x, p.y)
    else if (e.type === 'text'){ eat(e.x, e.y); eat(e.x + e.str.length * e.h * 0.62, e.y + e.h) }
    else if (e.type === 'dim'){ eat(e.x1, e.y1); eat(e.x2, e.y2); eat(e.x1, e.y1 + e.off); eat(e.x2, e.y2 + e.off) }
  }
  return [x0, y0, x1, y1]
}

mkdirSync(PREVIEWS, { recursive: true })
const files = readdirSync(DIR).filter(f => f.endsWith('.mscript')).sort()
if (!files.length){ console.error(`no .mscript files in ${DIR}`); process.exit(1) }

const out = []
for (const f of files){
  const src = readFileSync(join(DIR, f), 'utf8')
  const title = (src.match(/^#\s*@title\s+(.+)$/m) || [])[1]?.trim()
  const sheet = (src.match(/^#\s*@sheet\s+(.+)$/m) || [])[1]?.trim()
  if (!title){ console.error(`✗ ${f}: missing "# @title …" header`); process.exit(1) }

  reset()
  const r = engine.executeScript(src)
  if (r.errors.length){
    for (const e of r.errors) console.error(`✗ ${f}: line ${e.line}: ${e.msg}`)
    process.exit(1)
  }

  const areas = r.logs.filter(l => l.text.includes('— area')).map(l => l.text)
  const doc = { layers: S.layers, entities: S.entities, idSeq: S.getIdSeq(), units: S.units }

  // preview sheet: fit the extents on A4 landscape (margins ~15mm)
  const [x0, y0, x1, y1] = bbox()
  const pad = 40
  const win = [x0 - pad, y0 - pad, x1 + pad, y1 + pad]
  const scaleN = Math.max(1, Math.ceil(Math.max((win[2]-win[0])*10/260, (win[3]-win[1])*10/175)))
  const svg = engine.renderPlotSVG({
    entities: S.entities, layers: S.layers, filename: f, date: 'seed-preview',
    settings: { paper: 'A4', landscape: true, scaleN, win, weight: 0.25, colors: true, units: S.units },
  })
  const preview = join(PREVIEWS, basename(f, '.mscript') + '.svg')
  writeFileSync(preview, svg)

  out.push({ file: f, title, sheet: sheet || null, entities: S.entities.length, areas, doc })
  console.error(`✓ ${f}: "${title}" — ${S.entities.length} entities, 1:${scaleN} preview → ${preview}`)
}
console.log(JSON.stringify(out))
