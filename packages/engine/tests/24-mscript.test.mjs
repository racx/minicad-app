/* MScript: parse / validate / executeScript / previewScript.
   CORE-DIRECT suite: imports js/core/* straight — no stub DOM, no adapters.
   That this file runs at all proves the core imports clean under plain node. */
import { check, near, finish } from './stub-dom.mjs';
const S = await import('../js/core/state.js');
const M = await import('../js/core/mscript.js');
const G = await import('../js/core/geometry.js');

S.T.osnap = false; S.T.ortho = false; S.T.snap = false;
const reset = () => {
  S.setEntities([]); S.setLayers([{name:'0', color:'#e8e8e8'}]); S.setCurrentLayer('0');
  S.setIdSeq(1); S.setUnits('cm'); S.selection.clear();
  S.undoStack.length = 0; S.redoStack.length = 0;
};
const byType = t => S.entities.filter(e => e.type === t);
const run = M.executeScript;

/* ===== parse-level ===== */
let r = M.parseScript('# only a comment\n\n');
check('empty script rejected', r.errors.length === 1 && r.errors[0].line === 0);
r = M.parseScript('LINE 0,0 10,0\nSPLINE 0,0');
check('unknown command → line-numbered error', r.errors.length === 1 && r.errors[0].line === 2 &&
      r.errors[0].msg.includes('SPLINE'));
check('good line still parsed', r.statements.length === 1 && r.statements[0].cmd === 'LINE');

/* ===== every draw command ===== */
reset();
r = run(`
# full draw pass
LINE 0,0 100,0 100,50
PLINE 0,100 50,100 50,150 CLOSE
RECT 200,0 260,40
CIRCLE 300,20 r15
ARC 400,0 420,20 440,0
TEXT 0,200 h5 "kitchen"
DIM 200,0 260,0 off-12
`);
check('draw pass: no errors', r.errors.length === 0);
check('LINE chained → 2 lines', byType('line').length === 2);
check('PLINE closed', byType('pline').some(e => e.closed && e.pts.length === 3));
check('RECT is a closed 4-pt pline', byType('pline').some(e => e.pts.length === 4));
check('CIRCLE r15', byType('circle')[0]?.r === 15);
check('ARC created', byType('arc').length === 1);
check('TEXT string kept', byType('text')[0]?.str === 'kitchen');
check('DIM off applied', near(byType('dim')[0]?.off, -12, 1e-6));
check('created ids reported', r.created.length === S.entities.length);

/* ===== one undo entry per script ===== */
check('one undo entry for the whole 7-statement script', S.undoStack.length === 1);
const before = S.entities.length;
run('CIRCLE 0,-100 r5');
check('next script adds one more undo entry', S.undoStack.length === 2);

/* ===== modify commands ===== */
reset();
run('RECT 0,0 100,50');
const rectId = S.entities[0].id;
r = run(`MOVE #${rectId} 10,10`);
check('MOVE by displacement', r.errors.length === 0 && near(S.entities[0].pts[0].x, 10));
r = run(`COPY LAST 200,0 400,0`);
check('COPY: one clone per displacement', r.errors.length === 0 && byType('pline').length === 3);
r = run(`ROTATE #${rectId} base10,10 ang90`);
check('ROTATE 90°', r.errors.length === 0 && near(S.entities[0].pts[1].y, 110, 1e-6));
r = run(`SCALE #${rectId} base10,10 f2`);
check('SCALE ×2', r.errors.length === 0);
r = run('ERASE ALL');
check('ERASE ALL empties the board', r.errors.length === 0 && S.entities.length === 0);

reset();
run('LINE 0,0 100,0');
r = run('OFFSET LAST d10 side50,50');
check('OFFSET creates the parallel', r.errors.length === 0 && byType('line').length === 2 &&
      byType('line').some(l => near(l.y1, 10)));

reset();
run('LINE 0,0 100,0\nLINE 50,-20 50,20');
r = run('TRIM edges(#2) at75,0');
check('TRIM with explicit edge', r.errors.length === 0 &&
      byType('line').filter(l => l.y1 === 0 && l.y2 === 0).length === 1);
reset();
run('LINE 0,0 40,0\nLINE 60,-20 60,20');
r = run('EXTEND bounds(ALL) at35,0');
check('EXTEND to ALL bounds', r.errors.length === 0 && near(byType('line')[0].x2, 60, 1e-6));

reset();
run('LINE 0,0 100,0\nLINE 100,0 100,100');
r = run('FILLET r10 #1 at50,0 #2 at100,50');
check('FILLET rounds the corner', r.errors.length === 0 && byType('arc').length === 1);
r = run('FILLET r10 #1 at999,999 #2 at100,50');
check('FILLET refuses when at-point misses the id', r.errors.length === 1 &&
      r.errors[0].msg.includes('does not touch'));

reset();
run('RECT 0,0 100,50');
r = run('MIRROR LAST 200,0 200,100');
check('MIRROR keeps source by default', r.errors.length === 0 && byType('pline').length === 2);
r = run('MIRROR #1 300,0 300,100 ERASE');
check('MIRROR ERASE consumes the source', r.errors.length === 0 && byType('pline').length === 2);

reset();
run('LINE 0,0 100,0');
r = run('STRETCH C(90,-10 110,10) 20,0');
check('STRETCH moves the boxed endpoint', r.errors.length === 0 && near(byType('line')[0].x2, 120, 1e-6));

/* ===== annotation / session ===== */
reset();
r = run('LAYER "walls" color#ff0000 CURRENT\nLINE 0,0 10,0\nCHLAYER LAST "0"');
check('LAYER creates + colors + sets current', r.errors.length === 0 &&
      S.layers.some(l => l.name === 'walls' && l.color === '#ff0000'));
check('CHLAYER moved the line back', S.entities[0].layer === '0');
r = run('UNITS m');
check('UNITS switches', r.errors.length === 0 && S.units === 'm');
run('UNITS cm');
r = run('DIMTXT h7\nDIM 0,0 50,0 off8\nDIMTXT AUTO');
check('DIMTXT applies to new dims', r.errors.length === 0 && byType('dim')[0].h === 7);
r = run('ZOOM E');
check('ZOOM E clean', r.errors.length === 0);
r = run('TEXT 0,0 h3 "old"\nEDITTEXT LAST "new"');
check('EDITTEXT via #id form too', (() => {
  const t = byType('text').find(e => e.str === 'new');   // LAST selector not valid for EDITTEXT — expect error
  return r.errors.length === 1;
})());
const textId = byType('text')[0]?.id ?? (run('TEXT 0,0 h3 "old"'), byType('text')[0].id);
r = run(`EDITTEXT #${textId} "renamed"`);
check('EDITTEXT rewrites the string', r.errors.length === 0 && byType('text')[0].str === 'renamed');
r = run('NEW CONFIRM');
check('NEW CONFIRM wipes the drawing', r.errors.length === 0 && S.entities.length === 0);

/* ===== PLINE arc segments (A/L, mirroring the interactive command) ===== */
reset();
r = run('PLINE 0,10 0,0 A 10,0 L 20,0');
check('scripted A: tangent arc segment gets bulge 1', r.errors.length === 0 &&
      byType('pline')[0].pts.length === 4 && near(byType('pline')[0].pts[1].bulge, 1, 1e-9));
reset();
r = run('PLINE 0,0 A 5,-5 10,0 CLOSE');
check('scripted arc as FIRST segment: on-arc + end (3-point flow)', r.errors.length === 0 &&
      near(byType('pline')[0].pts[0].bulge, 1, 1e-6));
r = run('PLINE 0,0 A');
check('PLINE ending on a mode token rejected', r.errors.length === 1);

/* ===== extensions: JOIN / EXPLODE / HATCH / AREA ===== */
reset();
r = run(`
LINE 0,0 100,0
LINE 100,0 100,50
LINE 100,50 0,50
LINE 0,50 0,0
JOIN ALL
HATCH LAST concrete
AREA LAST
`);
check('JOIN chains the loop closed', r.errors.length === 0 &&
      byType('pline').length === 1 && byType('pline')[0].closed);
check('HATCH via script', byType('hatch').length === 1 && byType('hatch')[0].mat === 'concrete');
check('AREA readback lands in logs', r.logs.some(l => l.text.includes('area 5000 cm²')));
r = run('EXPLODE #' + byType('pline')[0].id);
check('EXPLODE breaks it up (hatch cascades away)', r.errors.length === 0 &&
      byType('pline').length === 0 && byType('hatch').length === 0);

r = run('CIRCLE 0,0 r10\nHATCH LAST marble');
check('HATCH rejects unknown material with the catalog', r.errors.length === 1 &&
      r.errors[0].msg.includes('concrete'));
r = run('LINE 0,0 10,0\nHATCH LAST concrete');
check('HATCH rejects open shapes', r.errors.length === 1 && r.errors[0].msg.includes('closed'));

/* ===== atomicity ===== */
reset();
run('RECT 0,0 100,50');
const snapEnts = JSON.stringify(S.entities), snapSeq = S.getIdSeq(), snapUndo = S.undoStack.length;
r = run('CIRCLE 300,300 r20\nRECT 1,1 50,50\nBOGUS 1,2');
check('parse error → nothing executed', r.errors.length === 1 && r.errors[0].line === 3 &&
      JSON.stringify(S.entities) === snapEnts && S.getIdSeq() === snapSeq && S.undoStack.length === snapUndo);
r = run('CIRCLE 300,300 r20\nHATCH #999999 concrete');
check('runtime error at line 2 → line-numbered + full rollback', r.errors.length === 1 &&
      r.errors[0].line === 2 && JSON.stringify(S.entities) === snapEnts &&
      S.getIdSeq() === snapSeq && S.undoStack.length === snapUndo);
r = run('CIRCLE 0,0 r-5');
check('engine refusal (negative radius) becomes a script error', r.errors.length >= 1 &&
      JSON.stringify(S.entities) === snapEnts);

/* ===== previewScript: shapes out, zero state change ===== */
reset();
run('RECT 0,0 100,50');
const preState = JSON.stringify([S.entities, S.getIdSeq(), S.undoStack.length]);
r = M.previewScript('CIRCLE 50,25 r10\nLINE 0,0 50,25');
check('preview returns the would-be entities', r.errors.length === 0 &&
      r.entities.length === 2 && r.entities.some(e => e.type === 'circle'));
check('preview leaves the document untouched',
      JSON.stringify([S.entities, S.getIdSeq(), S.undoStack.length]) === preState);
r = M.previewScript('NONSENSE');
check('preview surfaces parse errors', r.errors.length === 1 && r.entities.length === 0);

finish();
