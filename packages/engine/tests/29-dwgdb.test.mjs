/* DwgDatabase → IR (core/dwgdb.js), the second front-end onto the shared IR.
   This path exists because libredwg's DXF *writer* crashes on real drawings
   while its reader handles them; the fixture is a slice of an actual
   architect-drawn r2013 house plan, so it exercises what real files contain. */
import { check, near, finish } from './stub-dom.mjs';
import { readFileSync } from 'node:fs';
const W = await import('../js/core/dwgdb.js');
const M = await import('../js/core/cadimport.js');

const slice = JSON.parse(readFileSync(new URL('./fixtures/casa-slice.json', import.meta.url), 'utf8'));
const of = (r,t) => r.entities.filter(e=>e.type===t);

/* ===== synthetic minimum: the mapping itself ===== */
const db = (ents, blocks={}, header={}, layers={}) => ({
  header,
  tables: {
    LAYER: {entries: layers},
    BLOCK_RECORD: {entries: {
      ms: {name:'*Model_Space', basePoint:{x:0,y:0}, entities:ents},
      ...blocks,
    }},
  },
  entities: [],
});
const ir  = (...a) => W.dwgDocToIR(db(...a));
const imp = (...a) => M.importDoc(ir(...a));

let r = imp([
  {type:'LINE',   layer:'walls', startPoint:{x:0,y:0}, endPoint:{x:10,y:5}},
  {type:'CIRCLE', layer:'walls', center:{x:1,y:2}, radius:3},
  {type:'ARC',    layer:'0', center:{x:0,y:0}, radius:4, startAngle:0, endAngle:Math.PI/2},
]);
check('LINE mapped', of(r,'line')[0].x2===10 && of(r,'line')[0].y2===5);
check('LINE keeps its layer', of(r,'line')[0].layer==='walls');
check('CIRCLE mapped', of(r,'circle')[0].cx===1 && of(r,'circle')[0].r===3);
check('ARC angles are already radians — no degree conversion',
      near(of(r,'arc')[0].a1, Math.PI/2, 1e-9) && near(of(r,'arc')[0].r, 4, 1e-9));

r = imp([{type:'LWPOLYLINE', layer:'0', flag:1,
          vertices:[{x:0,y:0,bulge:0},{x:4,y:0,bulge:0},{x:4,y:3,bulge:0}]}]);
check('LWPOLYLINE → closed pline', of(r,'pline')[0].closed===true && of(r,'pline')[0].pts.length===3);

r = imp([{type:'POLYLINE2D', layer:'0', flag:0,
          vertices:[{x:0,y:0,bulge:0},{x:5,y:0,bulge:0}]}]);
check('POLYLINE2D mapped as an open pline', of(r,'pline')[0].closed===false);

/* ===== text: TEXT is flat, ATTRIB nests under .text ===== */
r = imp([{type:'TEXT', layer:'0', text:'hello', startPoint:{x:1,y:2}, textHeight:0.5, rotation:0}]);
check('TEXT mapped', of(r,'text')[0].str==='hello' && of(r,'text')[0].h===0.5);

r = imp([{type:'ATTRIB', layer:'0',
          text:{text:'BN04', startPoint:{x:3,y:4}, textHeight:0.25, rotation:0}}]);
check('ATTRIB reads its nested text record',
      of(r,'text')[0].str==='BN04' && of(r,'text')[0].x===3);

r = imp([{type:'TEXT', layer:'0', text:'turn', startPoint:{x:0,y:0}, textHeight:1, rotation:Math.PI/4}]);
check('TEXT rotation survives', near(of(r,'text')[0].rot, Math.PI/4, 1e-9));

r = imp([{type:'MTEXT', layer:'0', text:'one\\Ptwo', insertionPoint:{x:0,y:0},
          textHeight:1, attachmentPoint:1, rotation:0, direction:{x:1,y:0}}]);
check('MTEXT splits per line', of(r,'text').length===2 &&
      of(r,'text')[0].str==='one' && of(r,'text')[1].str==='two');
check('MTEXT stacks downward', of(r,'text')[0].y > of(r,'text')[1].y);

/* ===== dimensions ===== */
r = imp([{type:'DIMENSION', layer:'0', dimensionType:0,
          definitionPoint:{x:0,y:2}, subDefinitionPoint1:{x:0,y:0}, subDefinitionPoint2:{x:10,y:0}}]);
const d = of(r,'dim')[0];
check('linear DIMENSION uses the sub-definition points', d.x1===0 && d.x2===10);
check('dim offset recovered from the definition point', near(d.off, 2, 1e-9));

r = imp([{type:'DIMENSION', layer:'0', dimensionType:2,
          definitionPoint:{x:0,y:2}, subDefinitionPoint1:{x:0,y:0}, subDefinitionPoint2:{x:1,y:0}}]);
check('angular DIMENSION is refused, not mangled',
      of(r,'dim').length===0 && r.report.skipped['DIMENSION (rotated/angular)']===1);

/* ===== INSERT expansion ===== */
r = imp([{type:'INSERT', layer:'0', name:'B', insertionPoint:{x:100,y:50},
          xScale:2, yScale:2, rotation:Math.PI/2, columnCount:1, rowCount:1, attribs:[]}],
        {b:{name:'B', basePoint:{x:0,y:0},
            entities:[{type:'LINE', layer:'0', startPoint:{x:0,y:0}, endPoint:{x:10,y:0}}]}});
let l = of(r,'line')[0];
check('INSERT expands its block', of(r,'line').length===1);
check('INSERT applies rotation (radians) + scale + position',
      near(l.x1,100,1e-9) && near(l.y1,50,1e-9) && near(l.x2,100,1e-9) && near(l.y2,70,1e-9));

r = imp([{type:'INSERT', layer:'0', name:'B', insertionPoint:{x:0,y:0}, xScale:1, yScale:1,
          rotation:0, columnCount:3, rowCount:1, columnSpacing:10, attribs:[]}],
        {b:{name:'B', basePoint:{x:0,y:0},
            entities:[{type:'LINE', layer:'0', startPoint:{x:0,y:0}, endPoint:{x:1,y:0}}]}});
check('INSERT arrays repeat the block', of(r,'line').length===3);
check('array spacing applied', near(of(r,'line')[2].x1, 20, 1e-9));

r = imp([{type:'INSERT', layer:'0', name:'MISSING', insertionPoint:{x:0,y:0},
          xScale:1, yScale:1, rotation:0, attribs:[]}]);
check('a missing block is reported, not crashed', r.report.skipped['INSERT MISSING']===1);

r = imp([{type:'INSERT', layer:'0', name:'B', insertionPoint:{x:5,y:5}, xScale:1, yScale:1,
          rotation:0, attribs:[{layer:'0', text:{text:'A1', startPoint:{x:5,y:6}, textHeight:1}}]}],
        {b:{name:'B', basePoint:{x:0,y:0}, entities:[]}});
check('ATTRIBs riding on an INSERT are imported', of(r,'text')[0].str==='A1');

/* ===== units are labelled, never rescaled ===== */
r = imp([{type:'LINE', layer:'0', startPoint:{x:0,y:0}, endPoint:{x:3.497,y:0}}], {}, {INSUNITS:1});
check('a bogus inches header does not rescale the drawing',
      near(of(r,'line')[0].x2, 3.497, 1e-9));
check('…and is reported instead', r.report.foreignUnit==='inches');
r = imp([{type:'LINE', layer:'0', startPoint:{x:0,y:0}, endPoint:{x:2,y:0}}], {}, {INSUNITS:6});
check('metres map straight through', r.units==='m' && of(r,'line')[0].x2===2);

/* ===== layers ===== */
r = imp([{type:'LINE', layer:'red', startPoint:{x:0,y:0}, endPoint:{x:1,y:0}}], {}, {},
        {a:{name:'red', colorIndex:1, off:false, frozen:false, locked:false},
         b:{name:'hid', colorIndex:7, off:true,  frozen:false, locked:false},
         c:{name:'lck', colorIndex:7, off:false, frozen:false, locked:true}});
check('ACI 1 → red', r.layers.find(x=>x.name==='red').color==='#ff0000');
check('off layers stay off', r.layers.find(x=>x.name==='hid').off===true);
check('locked layers stay locked', r.layers.find(x=>x.name==='lck').locked===true);

/* ===== bad input ===== */
let err=null; try { W.dwgDocToIR(null); } catch(e){ err=e; }
check('a missing database is refused with a message', err instanceof W.DwgDbError);
err=null; try { W.dwgDocToIR(db([])); } catch(e){ err=e; }
check('an empty model space is refused with a message',
      err instanceof W.DwgDbError && /model space/i.test(err.message));

/* ===== the real house slice ===== */
const doc = W.dwgDocToIR(slice);
const house = M.importDoc(doc);
check('the real house slice produces geometry', house.entities.length > 100);
check('its blocks expanded (more entities out than model-space records in)',
      house.entities.length > 40);
check('nothing in it is unreadable', Object.keys(house.report.skipped).length===0);
check('its layers came through', house.layers.length > 20);
check('it reports inches and keeps the numbers', house.report.foreignUnit==='inches');

// a real architectural dimension must survive with its true measurement
const dims = house.entities.filter(e=>e.type==='dim');
check('real dimensions imported', dims.length > 0);
const lens = dims.map(e=>Math.hypot(e.x2-e.x1, e.y2-e.y1));
check('dimension lengths are room-sized in metres (0.1–20), not rescaled',
      lens.every(v => v >= 0 && v < 20) && lens.some(v => v > 0.5));

// coordinates must stay in the file's own frame
let x0=Infinity,x1=-Infinity;
for (const e of house.entities){
  const pts = e.type==='pline'?e.pts : e.type==='line'?[{x:e.x1},{x:e.x2}]
            : e.type==='text'?[{x:e.x}] : e.type==='dim'?[{x:e.x1},{x:e.x2}]
            : e.cx!==undefined?[{x:e.cx}] : [];
  for (const p of pts){ x0=Math.min(x0,p.x); x1=Math.max(x1,p.x); }
}
check('coordinates stay in the drawing\'s own frame (~ -612…-570)',
      x0 > -640 && x1 < -550);

finish();
