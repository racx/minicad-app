/* Rotated TEXT: the `rot` field across every entity subsystem,
   both renderers, DXF export and DXF import. */
import { setupDOM, fakeFile, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const E = await import('../js/core/entities.js');
const G = await import('../js/core/geometry.js');
const IO= await import('../js/adapters/dom/io.js');
const P = await import('../js/core/plot.js');
const D = await import('../js/core/dxf.js');
const M = await import('../js/core/cadimport.js');

S.T.osnap=false; S.T.ortho=false;
const D90 = Math.PI/2;
const mkText = (rot)=>{
  S.setEntities([]); S.setIdSeq(1);
  C.startCommand('T'); C.handleEnter('0,0'); C.handleEnter('10'); C.handleEnter('AB');
  const e = S.entities[0];
  if (rot!==undefined) e.rot = rot;
  return e;
};

/* ===== backwards compatibility: no rot means horizontal ===== */
let t = mkText();
check('TEXT drawn today has no rot field', t.rot===undefined);
const flatBox = E.entBBox(t);
check('unrotated bbox unchanged (w = len*h*0.62)',
      near(flatBox[0],0) && near(flatBox[1],0) &&
      near(flatBox[2], 2*10*0.62, 1e-9) && near(flatBox[3],10,1e-9));
check('a rot of 0 behaves exactly like no rot',
      JSON.stringify(E.entBBox({...t, rot:0}))===JSON.stringify(flatBox));

/* ===== geometry helpers ===== */
t = mkText(D90);
const c = G.textCorners(t);
check('90° corners rotate CCW: baseline runs +y',
      near(c[1].x,0,1e-9) && near(c[1].y, 2*10*0.62, 1e-9));
check('90° corners: text body extends -x',
      near(c[3].x,-10,1e-9) && near(c[3].y,0,1e-9));
const loc = G.textLocal(t, {x:0, y:5});
check('textLocal maps world→text frame', near(loc.x,5,1e-9) && near(loc.y,0,1e-9));
check('textLocal of the insertion point is the origin',
      (l=>near(l.x,0,1e-9)&&near(l.y,0,1e-9))(G.textLocal(t,{x:0,y:0})));

/* ===== bbox / hit-test follow the rotation ===== */
const box = E.entBBox(t);
check('90° bbox is the flat one turned on its side',
      near(box[0],-10,1e-9) && near(box[1],0,1e-9) &&
      near(box[2],0,1e-9)   && near(box[3], 2*10*0.62, 1e-9));

check('a point on the rotated glyph body hits', E.entHitDist(t, {x:-5, y:6})===0);
check('the same point misses when the text is flat', E.entHitDist(mkText(), {x:-5, y:6})>0);
t = mkText(D90);
check('a point on the flat body now misses', E.entHitDist(t, {x:5, y:6})>0);
check('distance grows away from the rotated box',
      E.entHitDist(t, {x:-30, y:5}) > 15);

/* ===== grips ===== */
const gr = E.entGrips(t);
check('rotated text has insertion + rotation grips', gr.length===2 &&
      gr[0].g==='ins' && gr[1].g==='rot');
check('the rot grip sits at the far end of the baseline',
      near(gr[1].x,0,1e-9) && near(gr[1].y, 2*10*0.62, 1e-9));

E.applyGrip(t, 'rot', {x:0, y:-5});
check('dragging the rot grip sets the angle', near(t.rot, 3*Math.PI/2, 1e-9));
E.applyGrip(t, 'rot', {x:0, y:0});
check('dropping the rot grip on the insertion point is ignored',
      near(t.rot, 3*Math.PI/2, 1e-9));
E.applyGrip(t, 'ins', {x:7, y:8});
check('the ins grip still moves and leaves rotation alone',
      t.x===7 && t.y===8 && near(t.rot, 3*Math.PI/2, 1e-9));

/* ===== transforms ===== */
t = mkText(0.5);
E.translateEnt(t, 3, 4);
check('translate leaves rotation alone', t.x===3 && t.y===4 && t.rot===0.5);

// ROTATE adds to the text's own angle
S.setEntities([]); S.setIdSeq(1);
C.startCommand('T'); C.handleEnter('0,0'); C.handleEnter('10'); C.handleEnter('AB');
S.entities[0].rot = 0;
S.selection.clear(); S.selection.add(S.entities[0].id);
C.startCommand('RO'); C.handleEnter('0,0'); C.handleEnter('90');
check('ROTATE spins the glyphs, not just the insertion point',
      near(S.entities[0].rot, D90, 1e-9));
S.selection.clear(); S.selection.add(S.entities[0].id);
C.startCommand('RO'); C.handleEnter('0,0'); C.handleEnter('90');
check('ROTATE accumulates', near(S.entities[0].rot, Math.PI, 1e-9));

// SCALE resizes, never spins
t = mkText(0.7);
S.selection.clear(); S.selection.add(t.id);
C.startCommand('SC'); C.handleEnter('0,0'); C.handleEnter('2');
check('SCALE doubles the height and keeps the angle',
      near(S.entities[0].h,20,1e-9) && near(S.entities[0].rot,0.7,1e-9));

// MIRROR reflects the angle but keeps text readable (MIRRTEXT=0)
t = mkText(0.3);
E.mirrorEnt(t, {x:0,y:0}, {x:0,y:100});          // mirror across the y axis
check('mirror reflects the angle', near(t.rot, G.readableAng(Math.PI-0.3), 1e-9));
check('mirrored text stays readable (never upside down)',
      t.rot <= Math.PI/2 + 1e-9 || t.rot >= 3*Math.PI/2 - 1e-9);
t = mkText();
E.mirrorEnt(t, {x:0,y:0}, {x:0,y:100});
check('mirroring unrotated text adds no rot field', !t.rot);

check('readableAng folds upside-down angles',
      near(G.readableAng(Math.PI), 0, 1e-9) &&
      near(G.readableAng(Math.PI*0.9), G.normAng(Math.PI*0.9+Math.PI), 1e-9));
check('readableAng leaves right-way-up angles alone',
      near(G.readableAng(0.4), 0.4, 1e-9) && near(G.readableAng(5.6), 5.6, 1e-9));

/* ===== renderers ===== */
S.setEntities([]); S.setIdSeq(1);
C.startCommand('T'); C.handleEnter('0,0'); C.handleEnter('10'); C.handleEnter('AB');
const plotSet = {paper:'A4', landscape:true, scaleN:50, win:[0,0,400,300],
                 weight:0.35, colors:false, units:'cm'};
const plot = rot => P.buildPlotSVG({
  entities:[{id:1, type:'text', layer:'0', x:0, y:0, h:10, str:'AB', ...(rot?{rot}:{})}],
  layers:[{name:'0', color:'#e8e8e8'}], settings:plotSet, filename:'t', date:'2026-08-01'});

let svg = plot(D90);
check('SVG rotates the text', /<text[^>]*transform="rotate\(/.test(svg));
check('SVG negates the angle for paper Y-down', /transform="rotate\(-90 /.test(svg));
svg = plot(0);
check('unrotated text emits no transform', !/<text[^>]*transform=/.test(svg));

/* ===== DXF export ===== */
S.entities[0].rot = D90;
let box2 = dom.captureDownload();
IO.dxfExport();
check('DXF export writes group code 50', /\n50\n90\b/.test(box2.data.replace(/\r/g,'')));
S.entities[0].rot = 0;
box2 = dom.captureDownload();
IO.dxfExport();
check('unrotated text writes no group code 50 on the TEXT',
      !/\n50\n/.test(box2.data.split('TEXT')[1] || ''));

/* ===== import round-trip ===== */
const imp = txt => M.importDoc(D.parseDXF(txt));
const ents = (...b)=>['0','SECTION','2','ENTITIES',...b,'0','ENDSEC','0','EOF'].join('\n');
let r = imp(ents('0','TEXT','8','0','10','1','20','2','40','3','1','hi','50','45'));
check('DXF import keeps the rotation', near(r.entities[0].rot, Math.PI/4, 1e-9));
check('rotated import is no longer reported as flattened',
      !M.reportLines(r.report,'x.dxf').some(l=>/flat/i.test(l)));
r = imp(ents('0','TEXT','8','0','10','1','20','2','40','3','1','hi'));
check('unrotated import sets no rot field', r.entities[0].rot===undefined);
r = imp(ents('0','TEXT','8','0','10','1','20','2','40','3','1','hi','50','360'));
check('a 360° rotation is normalised away', r.entities[0].rot===undefined);

// full round-trip through our own exporter
S.setEntities([]); S.setIdSeq(1);
C.startCommand('T'); C.handleEnter('5,5'); C.handleEnter('2.5'); C.handleEnter('turn');
S.entities[0].rot = 1.1;
const box3 = dom.captureDownload();
IO.dxfExport();
const back = imp(box3.data);
check('round-trip preserves the angle', near(back.entities[0].rot, 1.1, 1e-6));
check('round-trip preserves position and text',
      near(back.entities[0].x,5,1e-9) && back.entities[0].str==='turn');

/* ===== saved drawings keep working ===== */
S.setEntities([]); S.setIdSeq(1);
IO.openJSON(fakeFile('old.json', JSON.stringify({
  layers:[{name:'0',color:'#fff'}],
  entities:[{id:1, type:'text', layer:'0', x:0, y:0, h:5, str:'legacy'}],
  idSeq:2, units:'cm'})));
check('a pre-rotation saved file still opens', S.entities.length===1);
check('and its text is treated as horizontal',
      S.entities[0].rot===undefined && near(E.entBBox(S.entities[0])[3], 5, 1e-9));

finish();
