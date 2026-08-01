/* DXF import: parser → neutral IR → MiniCAD entities.
   Covers native mapping, the locked FROZEN layer for curves we can only
   approximate, INSERT expansion, units, and a round-trip of our own export. */
import { setupDOM, fakeFile, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S  = await import('../js/core/state.js');
const C  = await import('../js/core/commands.js');
const IO = await import('../js/adapters/dom/io.js');
const D  = await import('../js/core/dxf.js');
const M  = await import('../js/core/cadimport.js');

S.T.osnap=false; S.T.ortho=false;

const ents = (...body)=>['0','SECTION','2','ENTITIES', ...body, '0','ENDSEC','0','EOF'].join('\n');
const wrap = (head, tables, blocks, body)=>[
  '0','SECTION','2','HEADER', ...head, '0','ENDSEC',
  ...(tables.length ? ['0','SECTION','2','TABLES', ...tables, '0','ENDSEC'] : []),
  ...(blocks.length ? ['0','SECTION','2','BLOCKS', ...blocks, '0','ENDSEC'] : []),
  '0','SECTION','2','ENTITIES', ...body, '0','ENDSEC','0','EOF'].join('\n');
const imp = text => M.importDoc(D.parseDXF(text));
const of  = (r,t) => r.entities.filter(e=>e.type===t);
const one = (r,t) => of(r,t)[0];

/* ===== native entity mapping ===== */
let r = imp(ents(
  '0','LINE','8','walls','10','0','20','0','11','100','21','50',
  '0','CIRCLE','8','walls','10','10','20','20','40','5',
  '0','ARC','8','0','10','0','20','0','40','10','50','0','51','90',
  '0','LWPOLYLINE','8','0','90','3','70','1','10','0','20','0','10','10','20','0','10','10','20','10',
  '0','TEXT','8','annot','10','1','20','2','40','3','1','hello'));
check('5 native entities, nothing frozen', r.entities.length===5 && r.report.frozen===0 && r.report.native===5);
const ln = one(r,'line');
check('LINE endpoints', ln.x1===0 && ln.y1===0 && ln.x2===100 && ln.y2===50);
check('LINE keeps its DXF layer', ln.layer==='walls');
check('CIRCLE centre + radius', one(r,'circle').cx===10 && one(r,'circle').cy===20 && one(r,'circle').r===5);
const ar = one(r,'arc');
check('ARC degrees → radians CCW', near(ar.a0,0,1e-9) && near(ar.a1,Math.PI/2,1e-9) && near(ar.r,10,1e-9));
const pl = one(r,'pline');
check('LWPOLYLINE → closed pline, 3 pts', pl.closed===true && pl.pts.length===3 && pl.pts[1].x===10);
const tx = one(r,'text');
check('TEXT position/height/string', tx.x===1 && tx.y===2 && tx.h===3 && tx.str==='hello');
check('every entity got a unique id', new Set(r.entities.map(e=>e.id)).size===5);

/* ===== bulges and curves land on the locked FROZEN layer ===== */
r = imp(ents('0','LWPOLYLINE','8','walls','90','2','70','0',
             '10','0','20','0','42','1','10','10','20','0'));   // bulge 1 = half circle
const fz = one(r,'pline');
check('bulged polyline is frozen, not native', r.report.frozen===1 && r.report.native===0);
check('frozen geometry moves to the FROZEN layer', fz.layer===M.FROZEN_LAYER);
check('FROZEN layer is locked', r.layers.find(l=>l.name===M.FROZEN_LAYER).locked===true);
check('bulge tessellated into many points', fz.pts.length>8);
// +1 bulge = CCW half turn, which for this chord sweeps *below* it
check('bulge 1 = semicircle of radius 5', near(Math.min(...fz.pts.map(p=>p.y)), -5, 0.05));
check('bulge arc stays on its chord', near(fz.pts[0].x,0,1e-9) && near(fz.pts[fz.pts.length-1].x,10,1e-9));
const neg = one(imp(ents('0','LWPOLYLINE','8','0','90','2','70','0',
                         '10','0','20','0','42','-1','10','10','20','0')),'pline');
check('negative bulge sweeps the other way', near(Math.max(...neg.pts.map(p=>p.y)), 5, 0.05));

r = imp(ents('0','ELLIPSE','8','0','10','0','20','0','11','20','21','0','40','0.5','41','0','42','0'));
const el = one(r,'pline');
check('ELLIPSE frozen as a closed pline', el && el.closed===true && el.layer===M.FROZEN_LAYER);
check('ELLIPSE respects the 0.5 minor ratio',
      near(Math.max(...el.pts.map(p=>Math.abs(p.x))),20,0.01) &&
      near(Math.max(...el.pts.map(p=>Math.abs(p.y))),10,0.01));

// a degree-1 spline is a straight run: exact enough to assert on
r = imp(ents('0','SPLINE','8','0','70','8','71','1',
             '40','0','40','0','40','1','40','1',
             '10','0','20','0','10','10','20','10'));
const sp = one(r,'pline');
check('SPLINE frozen as a pline', sp && sp.layer===M.FROZEN_LAYER);
check('degree-1 spline follows its control polygon',
      near(sp.pts[0].x,0,1e-6) && near(sp.pts[sp.pts.length-1].x,10,1e-6) &&
      sp.pts.every(p=>near(p.x,p.y,1e-6)));

/* ===== BLOCK / INSERT expansion ===== */
r = imp(wrap([], [],
  ['0','BLOCK','2','B','10','0','20','0',
   '0','LINE','8','0','10','0','20','0','11','10','21','0',
   '0','ENDBLK'],
  ['0','INSERT','8','0','2','B','10','100','20','50','41','2','42','2','50','90']));
const il = one(r,'line');
check('INSERT expands the block into a real entity', r.entities.length===1);
check('INSERT applies scale + rotation + position',
      near(il.x1,100,1e-9) && near(il.y1,50,1e-9) && near(il.x2,100,1e-9) && near(il.y2,70,1e-9));

r = imp(wrap([], [],
  ['0','BLOCK','2','B','10','0','20','0',
   '0','LINE','8','0','10','0','20','0','11','1','21','0','0','ENDBLK'],
  ['0','INSERT','8','0','2','B','10','0','20','0','70','3','44','10']));
check('INSERT column array repeats the block', of(r,'line').length===3);
check('array spacing applied', near(of(r,'line')[2].x1,20,1e-9));

r = imp(ents('0','INSERT','8','0','2','MISSING','10','0','20','0'));
check('INSERT of an undefined block is reported, not crashed',
      r.entities.length===0 && r.report.skipped['INSERT MISSING']===1);

/* ===== units ===== */
r = imp(wrap(['9','$INSUNITS','70','1'], [], [], ['0','LINE','8','0','10','1','20','0','11','2','21','0']));
check('inches → mm units', r.units==='mm');
check('inch coordinates scaled by 25.4', near(one(r,'line').x1,25.4,1e-9) && near(one(r,'line').x2,50.8,1e-9));

r = imp(wrap(['9','$INSUNITS','70','5'], [], [], ['0','LINE','8','0','10','1','20','0','11','2','21','0']));
check('centimetre file needs no scaling', r.units==='cm' && one(r,'line').x1===1);

r = imp(ents('0','LINE','8','0','10','1','20','0','11','2','21','0'));
check('no $INSUNITS leaves units alone', r.units===null);

/* ===== layer table ===== */
r = imp(wrap([], ['0','TABLE','2','LAYER',
                  '0','LAYER','2','red','62','1','70','0',
                  '0','LAYER','2','hidden','62','-3','70','0',
                  '0','LAYER','2','frozen','62','4','70','5',
                  '0','ENDTAB'], [],
             ['0','LINE','8','red','10','0','20','0','11','1','21','0']));
check('ACI 1 → red', r.layers.find(l=>l.name==='red').color==='#ff0000');
check('negative colour index = layer off', r.layers.find(l=>l.name==='hidden').off===true);
check('flag 4 = layer locked', r.layers.find(l=>l.name==='frozen').locked===true);
check('flag 1 = layer frozen → off', r.layers.find(l=>l.name==='frozen').off===true);

r = imp(ents('0','LINE','8','nosuchlayer','10','0','20','0','11','1','21','0'));
check('layer referenced but not declared is created', r.layers.some(l=>l.name==='nosuchlayer'));

r = imp(wrap([], ['0','TABLE','2','LAYER','0','LAYER','2','only','62','7','70','4','0','ENDTAB'], [],
             ['0','LINE','8','only','10','0','20','0','11','1','21','0']));
check('all-locked file still offers a drawable layer', r.layers.some(l=>!l.locked && !l.off));

// a file where every drawn-on layer is off would open as a blank canvas
r = imp(wrap([], ['0','TABLE','2','LAYER',
                  '0','LAYER','2','0','62','-7','70','0',
                  '0','LAYER','2','a','62','-2','70','0','0','ENDTAB'], [],
             ['0','LINE','8','a','10','0','20','0','11','1','21','0']));
check('all-off file is made visible rather than blank',
      r.report.turnedOn===true && r.layers.find(l=>l.name==='a').off===false);
check('and the user is told', M.reportLines(r.report,'x.dxf').some(l=>/switched off/.test(l)));
check('layers the drawing never uses keep their off state',
      r.layers.find(l=>l.name==='0').off===true);
check('no duplicate "0" layer is invented',
      r.layers.filter(l=>l.name==='0').length===1);

// the FROZEN layer we invent must not make an all-off file look visible
r = imp(wrap([], ['0','TABLE','2','LAYER','0','LAYER','2','a','62','-2','70','0','0','ENDTAB'], [],
             ['0','LINE','8','a','10','0','20','0','11','1','21','0',
              '0','ELLIPSE','8','a','10','0','20','0','11','5','21','0','40','0.5','41','0','42','0']));
check('FROZEN does not mask an all-off file',
      r.report.turnedOn===true && r.layers.find(l=>l.name==='a').off===false);

/* ===== dimensions and MTEXT ===== */
r = imp(ents('0','DIMENSION','8','0','70','1','10','0','20','20','13','0','23','0','14','100','24','0'));
const dm = one(r,'dim');
check('aligned DIMENSION → native dim', !!dm && dm.x1===0 && dm.x2===100);
check('dim offset recovered from the dim-line defpoint', near(dm.off,20,1e-9));

r = imp(ents('0','DIMENSION','8','0','70','2','10','0','20','20','13','0','23','0','14','100','24','0'));
check('angular dimension is refused, not mangled',
      of(r,'dim').length===0 && r.report.skipped['DIMENSION (rotated/angular)']===1);

r = imp(ents('0','MTEXT','8','0','10','0','20','0','40','2','71','1','1','line one\\Pline two'));
check('MTEXT splits into one text per line', of(r,'text').length===2);
check('MTEXT formatting codes stripped',
      of(r,'text')[0].str==='line one' && of(r,'text')[1].str==='line two');
check('MTEXT lines stack downward', of(r,'text')[0].y > of(r,'text')[1].y);
check('MTEXT braces/font codes removed',
      one(imp(ents('0','MTEXT','8','0','10','0','20','0','40','2','1','{\\fArial|b1;bold} txt')),'text')
        .str==='bold txt');

/* ===== HATCH: a single closed loop becomes a REAL filled hatch =====
   This engine has a `hatch` entity (materials.js), so unlike a plain outline
   importer we can reproduce the fill. Multi-loop hatches still fall back to
   frozen outlines, because a hatch references exactly one boundary. */
// A solid-filled square as a polyline boundary path (92 flag bit 2), followed by
// the pattern section — whose 10/20/40/50/72/73/97 must NOT be read as geometry.
r = imp(ents('0','HATCH','8','walls','2','SOLID','70','1','91','1',
             '92','3','72','0','73','1','93','4',
             '10','0','20','0','10','10','20','0','10','10','20','10','10','0','20','10',
             '97','0',
             '75','0','76','1','52','0','41','1','77','0','78','0','47','0.5',
             '98','1','10','5','20','5'));
const hp = one(r,'pline');
check('HATCH polyline boundary imported', !!hp && hp.closed===true);
check('HATCH boundary has exactly its 4 corners — pattern data not eaten as points',
      hp.pts.length===4);
check('HATCH boundary corners are right',
      hp.pts[2].x===10 && hp.pts[2].y===10 && hp.pts[3].x===0 && hp.pts[3].y===10);
check('a fillable HATCH boundary stays on its own layer, editable',
      hp.layer==='walls' && r.report.frozen===0);
check('HATCH no longer counted as unreadable', !r.report.skipped['HATCH']);
check('hatched areas counted for the report', r.report.hatch===1);

const hf = one(r,'hatch');
check('a real hatch entity is created', !!hf);
check('the hatch references its boundary', hf.ref===hp.id);
check('the hatch lands on the boundary layer', hf.layer==='walls');
check('SOLID maps to the neutral material', hf.mat==='concrete');
check('the fill is reported, not silently invented',
      M.reportLines(r.report,'x.dxf').some(l=>/came in filled/.test(l)));

// pattern name drives the material guess
const matOf = pat => one(imp(ents('0','HATCH','8','0','2',pat,'91','1',
    '92','3','72','0','73','1','93','3',
    '10','0','20','0','10','9','20','0','10','0','20','9','97','0','75','0')),'hatch').mat;
check('GRASS → green area',   matOf('GRASS')==='green');
check('AR-B816 → brick',      matOf('AR-B816')==='brick');
check('ANSI31 → concrete',    matOf('ANSI31')==='concrete');
check('an unknown pattern falls back to concrete rather than guessing',
      matOf('SOMETHING-ODD')==='concrete');

// two loops can't be expressed as one filled boundary → frozen outlines
r = imp(ents('0','HATCH','8','0','2','SOLID','91','2',
             '92','3','72','0','73','1','93','3','10','0','20','0','10','9','20','0','10','0','20','9',
             '92','3','72','0','73','1','93','3','10','1','20','1','10','3','20','1','10','1','20','3',
             '97','0','75','1'));
check('an island hatch is not filled', of(r,'hatch').length===0);
check('…its loops are kept as frozen outlines',
      of(r,'pline').length===2 && of(r,'pline').every(p=>p.layer===M.FROZEN_LAYER));
check('…and the user is told why',
      M.reportLines(r.report,'x.dxf').some(l=>/too complex to fill/.test(l)));

// edge-type boundary: line + arc edges (92 without bit 2, 93 = edge count)
r = imp(ents('0','HATCH','8','0','2','ANSI31','70','0','91','1',
             '92','1','93','2',
             '72','1','10','0','20','0','11','10','21','0',
             '72','2','10','5','20','0','40','5','50','0','51','180','73','1',
             '97','0','75','1','76','1','52','0','41','1','78','0'));
check('HATCH line edge imported', of(r,'line').length===1 && of(r,'line')[0].x2===10);
check('HATCH arc edge imported with its angles',
      of(r,'arc').length===1 && near(of(r,'arc')[0].r,5,1e-6) &&
      near(of(r,'arc')[0].a1,Math.PI,1e-6));
check('HATCH edges are frozen', of(r,'line')[0].layer===M.FROZEN_LAYER &&
                                of(r,'arc')[0].layer===M.FROZEN_LAYER);

// a clockwise arc edge (73 = 0) must not come in reversed
r = imp(ents('0','HATCH','8','0','91','1','92','1','93','1',
             '72','2','10','0','20','0','40','5','50','0','51','90','73','0',
             '97','0','75','0'));
check('clockwise arc edge swaps its angles',
      near(one(r,'arc').a0, Math.PI/2, 1e-6) && near(one(r,'arc').a1, 0, 1e-6));

// bulged polyline boundary: 72=1 means each vertex carries a 42
r = imp(ents('0','HATCH','8','0','91','1','92','3','72','1','73','1','93','2',
             '10','0','20','0','42','1','10','10','20','0','42','1',
             '97','0','75','0'));
const hb = one(r,'pline');
check('bulged HATCH boundary tessellates into a circle',
      hb.pts.length>16 && near(Math.max(...hb.pts.map(p=>p.y)), 5, 0.05)
                       && near(Math.min(...hb.pts.map(p=>p.y)), -5, 0.05));


r = imp(ents('0','HATCH','8','0','2','SOLID','70','1'));   // no 91: nothing to draw
check('boundary-less HATCH still reported rather than silently dropped',
      r.report.skipped['HATCH']===1 && r.report.hatch===0);

/* ===== POINT is dropped quietly, unknown entities are reported ===== */
r = imp(ents('0','POINT','8','Defpoints','10','5','20','5',
             '0','MLINE','8','0','10','0','20','0'));
check('POINT dropped without scaring the user', !r.report.skipped['POINT']);
check('unreadable entity types are counted', r.report.skipped['MLINE']===1);

/* ===== bad input ===== */
let err=null;
try { D.parseDXF('AutoCAD Binary DXF\r\n '); } catch(e){ err=e; }
check('binary DXF refused with a human message',
      err instanceof D.DxfError && /binary DXF/i.test(err.message));
err=null;
try { D.parseDXF('this is not a dxf at all'); } catch(e){ err=e; }
check('junk refused with a human message', err instanceof D.DxfError);

/* ===== openDXF end to end ===== */
S.setEntities([]); S.undoStack.length=0; dom.logs.length=0;
C.startCommand('L'); C.handleEnter('0,0'); C.handleEnter('9,9'); C.handleEnter('');
S.undoStack.length=0;                       // measure the import's own snapshot
IO.openDXF(fakeFile('client.dxf', ents(
  '0','LINE','8','walls','10','0','20','0','11','100','21','0',
  '0','SPLINE','8','0','70','8','71','1','40','0','40','0','40','1','40','1',
  '10','0','20','0','10','10','20','10')));
check('openDXF replaces the drawing', S.entities.length===2);
check('openDXF is one undo step', S.undoStack.length===1);
check('openDXF leaves the user on an unlocked layer', S.layerUnlocked(S.currentLayer));
check('openDXF reports what it did', dom.logs.some(l=>/client\.dxf/.test(l)));
check('openDXF explains the FROZEN layer', dom.logs.some(l=>l.includes(M.FROZEN_LAYER)));
check('…and how to get at frozen objects', dom.logs.some(l=>/🔒/.test(l) && /👁/.test(l)));

const before = S.entities.length;
dom.logs.length=0;
IO.openDXF(fakeFile('junk.dxf', 'nonsense'));
check('a bad file leaves the drawing untouched', S.entities.length===before);
check('a bad file says so', dom.logs.some(l=>/could not|no DXF/i.test(l)));

/* ===== round-trip through our own DXF export ===== */
S.setEntities([]); S.setIdSeq(1);
S.setCurrentLayer('walls');
C.startCommand('L');   C.handleEnter('0,0');   C.handleEnter('100,0'); C.handleEnter('');
C.startCommand('C');   C.handleEnter('50,50'); C.handleEnter('25');
C.startCommand('A');   C.handleEnter('0,0');   C.handleEnter('10,10'); C.handleEnter('20,0');
C.startCommand('REC'); C.handleEnter('0,0');   C.handleEnter('40,30');
C.startCommand('T');   C.handleEnter('5,5');   C.handleEnter('2.5');   C.handleEnter('label');
const src = {line:of({entities:S.entities},'line')[0], circle:of({entities:S.entities},'circle')[0],
             arc:of({entities:S.entities},'arc')[0], pline:of({entities:S.entities},'pline')[0]};
const box = dom.captureDownload();
IO.dxfExport();
const back = imp(box.data);
check('round-trip: nothing frozen, nothing skipped',
      back.report.frozen===0 && Object.keys(back.report.skipped).length===0);
check('round-trip: line survives',
      near(of(back,'line')[0].x2, src.line.x2, 1e-6));
check('round-trip: circle survives',
      near(one(back,'circle').cx, src.circle.cx, 1e-6) && near(one(back,'circle').r, src.circle.r, 1e-6));
check('round-trip: arc survives',
      near(one(back,'arc').r, src.arc.r, 1e-4) &&
      near(one(back,'arc').a0, src.arc.a0, 1e-4) && near(one(back,'arc').a1, src.arc.a1, 1e-4));
const rp = one(back,'pline');
check('round-trip: rectangle survives closed', rp.closed===true && rp.pts.length===src.pline.pts.length);
check('round-trip: text survives', one(back,'text').str==='label' && near(one(back,'text').h,2.5,1e-9));
check('round-trip: layer names survive', of(back,'line')[0].layer==='walls');

finish();
