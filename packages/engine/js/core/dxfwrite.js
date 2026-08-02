/* =========================================================
   MiniCAD — entities → DXF R2000 (AC1015)

   The counterpart to dxf.js. R12 was chosen originally because it is
   forgiving: no handles, no dictionaries, no subclass markers. It is also
   incapable of carrying most of what we now import — a real house plan sent
   back as R12 loses 591 hatches, every layer colour and every lineweight.

   R2000 costs boilerplate (handles on everything, the full table set, owner
   back-pointers, AcDb* subclass markers) and buys hatches, true colour,
   lineweight, and real DIMENSION entities. Output is audited with ezdxf.

   Everything here is pure: give it {entities, layers, units}, get a string.
   ========================================================= */
import { normAng, fmt } from './geometry.js';
import { dimGeom, dimH, entBBox } from './entities.js';
import { materialByKey } from './materials.js';

const UNIT_CODE = { mm: 4, cm: 5, m: 6 };
const D = a => normAng(a) * 180 / Math.PI;

/* Hex handles, unique across the file. DXF requires them from R13 on and
   AutoCAD rejects duplicates outright. */
function handles(){
  let n = 0x100;
  return () => (++n).toString(16).toUpperCase();
}

export function buildDXF({entities = [], layers = [], units = 'cm'} = {}){
  const L = [];
  const p = (...a) => { for (const v of a) L.push(typeof v === 'number' ? f(v) : esc(String(v))); };
  const f = v => Number.isFinite(v) ? String(Math.round(v * 1e8) / 1e8) : '0';
  const h = handles();

  const usedLayers = layers.length ? layers : [{name:'0', color:'#ffffff'}];
  const byName = new Map(usedLayers.map(l => [l.name, l]));
  const layerOf = n => byName.get(n) || usedLayers[0];

  /* ---------- header ---------- */
  p('0','SECTION','2','HEADER');
  p('9','$ACADVER','1','AC1015');
  p('9','$HANDSEED','5','FFFF');
  p('9','$INSUNITS','70', UNIT_CODE[units] || 5);
  p('9','$EXTMIN','10',0,'20',0,'30',0);
  p('9','$EXTMAX','10',0,'20',0,'30',0);
  p('0','ENDSEC');

  /* ---------- tables ----------
     R2000 wants the full set even when most are empty; a missing STYLE or
     BLOCK_RECORD makes the file unreadable rather than merely lossy. */
  const hVPORT=h(), hLTYPE=h(), hLAYER=h(), hSTYLE=h(), hVIEW=h(), hUCS=h(), hAPPID=h(), hDIMSTYLE=h(), hBLKREC=h();
  p('0','SECTION','2','TABLES');

  const table = (name, ownerHandle, count, body) => {
    p('0','TABLE','2',name,'5',ownerHandle,'330','0','100','AcDbSymbolTable','70',count);
    body();
    p('0','ENDTAB');
  };

  table('VPORT', hVPORT, 1, () => {
    p('0','VPORT','5',h(),'330',hVPORT,'100','AcDbSymbolTableRecord','100','AcDbViewportTableRecord',
      '2','*Active','70',0,'10',0,'20',0,'11',1,'21',1,'12',0,'22',0,'13',0,'23',0,
      '14',10,'24',10,'15',10,'25',10,'16',0,'26',0,'36',1,'17',0,'27',0,'37',0,
      '40',1000,'41',1.5,'42',50,'43',0,'44',0,'50',0,'51',0,'71',0,'72',100,'73',1,
      '74',3,'75',0,'76',0,'77',0,'78',0);
  });

  table('LTYPE', hLTYPE, 2, () => {
    for (const n of ['ByBlock','ByLayer'])
      p('0','LTYPE','5',h(),'330',hLTYPE,'100','AcDbSymbolTableRecord','100','AcDbLinetypeTableRecord',
        '2',n,'70',0,'3','','72',65,'73',0,'40',0);
    p('0','LTYPE','5',h(),'330',hLTYPE,'100','AcDbSymbolTableRecord','100','AcDbLinetypeTableRecord',
      '2','Continuous','70',0,'3','Solid line','72',65,'73',0,'40',0);
  });

  table('LAYER', hLAYER, usedLayers.length, () => {
    for (const l of usedLayers){
      const rgb = hex(l.color);
      p('0','LAYER','5',h(),'330',hLAYER,'100','AcDbSymbolTableRecord','100','AcDbLayerTableRecord',
        '2', l.name,
        '70', l.locked ? 4 : 0,
        // a negative ACI is how DXF says "off"; true colour rides alongside in 420
        '62', l.off ? -7 : 7,
        '420', rgb,
        '6','Continuous',
        '370', lwCode(l.lw),
        '390','F');
    }
  });

  table('STYLE', hSTYLE, 1, () => {
    p('0','STYLE','5',h(),'330',hSTYLE,'100','AcDbSymbolTableRecord','100','AcDbTextStyleTableRecord',
      '2','Standard','70',0,'40',0,'41',1,'50',0,'71',0,'42',2.5,'3','txt','4','');
  });
  table('VIEW', hVIEW, 0, () => {});
  table('UCS',  hUCS,  0, () => {});
  table('APPID', hAPPID, 1, () => {
    p('0','APPID','5',h(),'330',hAPPID,'100','AcDbSymbolTableRecord','100','AcDbRegAppTableRecord',
      '2','ACAD','70',0);
  });
  table('DIMSTYLE', hDIMSTYLE, 1, () => {
    p('0','DIMSTYLE','105',h(),'330',hDIMSTYLE,'100','AcDbSymbolTableRecord','100','AcDbDimStyleTableRecord',
      '2','Standard','70',0,'140',2.5,'141',2.5,'147',0.625,'171',3,'172',1,'271',2,'341','');
  });

  const hMS = h(), hPS = h();     // model / paper space block records

  // A DIMENSION's graphics live in an anonymous block; without it the entity
  // is dropped on load ("DIMENSION without valid geometry block"). One block
  // per dim, named and handled up front so the tables can declare them.
  const dims = entities.filter(e => e.type === 'dim')
    .map((e, i) => ({e, name: '*D' + i, rec: h(), blk: h()}));

  table('BLOCK_RECORD', hBLKREC, 2 + dims.length, () => {
    for (const [name, hh] of [['*Model_Space', hMS], ['*Paper_Space', hPS]])
      p('0','BLOCK_RECORD','5',hh,'330',hBLKREC,'100','AcDbSymbolTableRecord','100','AcDbBlockTableRecord',
        '2',name,'70',0,'280',1,'281',0);
    for (const d of dims)
      p('0','BLOCK_RECORD','5',d.rec,'330',hBLKREC,'100','AcDbSymbolTableRecord','100','AcDbBlockTableRecord',
        '2',d.name,'70',0,'280',1,'281',0);
  });
  p('0','ENDSEC');

  /* ---------- blocks ---------- */
  p('0','SECTION','2','BLOCKS');
  for (const [name, owner] of [['*Model_Space', hMS], ['*Paper_Space', hPS]]){
    const hb = h();
    p('0','BLOCK','5',hb,'330',owner,'100','AcDbEntity','8','0','100','AcDbBlockBegin',
      '2',name,'70',0,'10',0,'20',0,'30',0,'3',name,'1','');
    p('0','ENDBLK','5',h(),'330',owner,'100','AcDbEntity','8','0','100','AcDbBlockEnd');
  }
  for (const d of dims){
    p('0','BLOCK','5',d.blk,'330',d.rec,'100','AcDbEntity','8', d.e.layer || '0','100','AcDbBlockBegin',
      '2',d.name,'70',1,'10',0,'20',0,'30',0,'3',d.name,'1','');
    dimGraphics(p, h, d.rec, d.e);
    p('0','ENDBLK','5',h(),'330',d.rec,'100','AcDbEntity','8', d.e.layer || '0','100','AcDbBlockEnd');
  }
  p('0','ENDSEC');

  /* ---------- entities ---------- */
  p('0','SECTION','2','ENTITIES');

  // common preamble for every entity: handle, owner, layer, and the author's
  // lineweight when they set one
  const head = (type, e, subclass) => {
    p('0', type, '5', h(), '330', hMS, '100', 'AcDbEntity', '8', e.layer || '0');
    if (e.lw) p('370', lwCode(e.lw));
    p('100', subclass);
  };

  const byId = new Map(entities.map(e => [e.id, e]));

  for (const e of entities){
    if (e.type === 'line'){
      head('LINE', e, 'AcDbLine');
      p('10',e.x1,'20',e.y1,'30',0,'11',e.x2,'21',e.y2,'31',0);
    }
    else if (e.type === 'circle'){
      head('CIRCLE', e, 'AcDbCircle');
      p('10',e.cx,'20',e.cy,'30',0,'40',e.r);
    }
    else if (e.type === 'arc'){
      head('ARC', e, 'AcDbCircle');
      p('10',e.cx,'20',e.cy,'30',0,'40',e.r,'100','AcDbArc','50',D(e.a0),'51',D(e.a1));
    }
    else if (e.type === 'pline'){
      head('LWPOLYLINE', e, 'AcDbPolyline');
      p('90', e.pts.length, '70', e.closed ? 1 : 0);
      for (const q of e.pts){
        p('10',q.x,'20',q.y);
        if (q.bulge) p('42', q.bulge);
      }
    }
    else if (e.type === 'text'){
      head('TEXT', e, 'AcDbText');
      p('10',e.x,'20',e.y,'30',0,'40',e.h,'1',e.str);
      if (e.rot) p('50', D(e.rot));
      p('100','AcDbText');
    }
    else if (e.type === 'hatch'){
      const b = byId.get(e.ref);
      if (b) writeHatch(p, head, e, b);
    }
    else if (e.type === 'dim'){
      const d = dims.find(x => x.e === e);
      if (d) writeDim(p, head, e, d.name);
    }
  }
  p('0','ENDSEC');

  /* ---------- objects ----------
     R2000 requires a root dictionary; without it the file loads but audits dirty. */
  const hDict = h(), hLayoutDict = h();
  p('0','SECTION','2','OBJECTS');
  p('0','DICTIONARY','5',hDict,'330','0','100','AcDbDictionary','281',1,
    '3','ACAD_GROUP','350',hLayoutDict);
  p('0','DICTIONARY','5',hLayoutDict,'330',hDict,'100','AcDbDictionary','281',1);
  p('0','ENDSEC');

  p('0','EOF');
  return L.join('\n');
}

/* The lines and text a dimension is made of, as block contents. Same geometry
   the screen renderer draws, so what the architect opens matches what you saw. */
function dimGraphics(p, h, owner, e){
  const g = dimGeom(e), th = dimH(e), layer = e.layer || '0';
  const line = (a, b) => p('0','LINE','5',h(),'330',owner,'100','AcDbEntity','8',layer,
                           '100','AcDbLine','10',a.x,'20',a.y,'30',0,'11',b.x,'21',b.y,'31',0);
  line({x:e.x1,y:e.y1}, g.a);                     // extension lines
  line({x:e.x2,y:e.y2}, g.b);
  line(g.a, g.b);                                 // dimension line
  const mid = {x:(g.a.x+g.b.x)/2, y:(g.a.y+g.b.y)/2};
  let deg = Math.atan2(e.y2-e.y1, e.x2-e.x1) * 180/Math.PI;
  if (deg > 90 || deg <= -90) deg += 180;         // keep the number readable
  p('0','TEXT','5',h(),'330',owner,'100','AcDbEntity','8',layer,'100','AcDbText',
    '10',mid.x,'20',mid.y,'30',0,'40',th,'1',fmt(g.L),'50',((deg%360)+360)%360,
    '72',1,'11',mid.x,'21',mid.y,'31',0,'100','AcDbText','73',0);
}

/* R2000 DXF is a byte-oriented format with a code page, not UTF-8. A layer
   called "Iluminação" or a label reading "ÁREA DE SERVIÇO" comes straight out
   of a Brazilian drawing and would be mojibake or a decode error on the way
   back. \U+XXXX is the escape AutoCAD understands in every version. */
export function esc(str){
  let out = '';
  for (const ch of str){
    const c = ch.codePointAt(0);
    out += c > 0x7e || c < 0x20
      ? '\\U+' + c.toString(16).toUpperCase().padStart(4, '0')
      : ch;
  }
  return out;
}

/* #rrggbb → the 24-bit int DXF group 420 wants */
function hex(c){
  const m = /^#?([0-9a-f]{6})$/i.exec(c || '');
  return m ? parseInt(m[1], 16) : 0xffffff;
}

/* mm → the DXF lineweight code (hundredths of a mm), snapped to the standard
   ladder because AutoCAD rejects values that are not on it. */
const LADDER = [0,5,9,13,15,18,20,25,30,35,40,50,53,60,70,80,90,100,106,120,140,158,200,211];
export function lwCode(mm){
  if (!(mm > 0)) return -3;                       // -3 = by default
  const want = Math.round(mm * 100);
  let best = LADDER[0];
  for (const v of LADDER) if (Math.abs(v - want) < Math.abs(best - want)) best = v;
  return best;
}

/* A hatch as one polyline boundary path. Our boundary is already a closed
   pline or a circle, which is exactly what a single-loop HATCH wants. */
function writeHatch(p, head, e, b){
  const mat = materialByKey(e.mat);
  const solid = !mat || mat.pattern.solid;
  head('HATCH', e, 'AcDbHatch');
  p('10',0,'20',0,'30',0,'210',0,'220',0,'230',1);
  p('2', solid ? 'SOLID' : 'ANSI31');
  p('70', solid ? 1 : 0);           // solid fill flag
  p('71', 0);                       // not associative
  p('91', 1);                       // one boundary path

  const pts = b.type === 'circle'
    ? Array.from({length:32}, (_,i) => {
        const a = i/32 * Math.PI*2;
        return {x:b.cx + b.r*Math.cos(a), y:b.cy + b.r*Math.sin(a)};
      })
    : b.pts;
  p('92', 3);                       // external | polyline
  p('72', 0);                       // no bulges (we hand over tessellated points)
  p('73', 1);                       // closed
  p('93', pts.length);
  for (const q of pts) p('10', q.x, '20', q.y);
  p('97', 0);                       // no source boundary objects

  p('75', 0, '76', 1);              // hatch style / pattern type
  if (!solid) p('52', 45, '41', 1, '77', 0, '78', 1, '53', 45, '43', 0, '44', 0, '45', 0, '46', 3.18, '79', 0);
  p('98', 0);                       // no seed points
}

/* A real DIMENSION plus the anonymous block holding its graphics — that is
   how DXF models dimensions, and it means the receiving CAD shows the
   measurement rather than three loose lines. */
function writeDim(p, head, e, blockName){
  const g = dimGeom(e);
  const th = dimH(e);
  const mid = {x:(g.a.x + g.b.x)/2, y:(g.a.y + g.b.y)/2};
  head('DIMENSION', e, 'AcDbDimension');
  p('2', blockName);                              // the block written in BLOCKS
  p('10',g.b.x,'20',g.b.y,'30',0);                // definition point
  p('11',mid.x,'21',mid.y,'31',0);                // text midpoint
  p('70', 1 + 32);                                // aligned + graphics are ours
  p('71', 5);                                     // middle-centre attachment
  p('42', Math.hypot(e.x2-e.x1, e.y2-e.y1));      // measurement
  p('1', fmt(g.L));
  p('3','Standard');
  p('100','AcDbAlignedDimension');
  p('13',e.x1,'23',e.y1,'33',0);
  p('14',e.x2,'24',e.y2,'34',0);
}
