/* =========================================================
   MiniCAD — LibreDWG DwgDatabase → the neutral CAD IR

   The second front-end onto the IR that `cadimport.js` consumes; `dxf.js` is
   the first. Everything downstream (freezing, hatch filling, layers, units)
   is shared.

   Why this exists rather than just converting DWG→DXF: libredwg's DXF *writer*
   crashes on real files (`memory access out of bounds` on a 330 KB r2013 house
   plan whose reader path parses 593 entities cleanly). The reader is solid; the
   writer is not. So we read the database and map it ourselves.

   Angles here are already radians and INSERT rotation is CCW, unlike DXF's
   degrees — that is the main difference from `dxf.js`.
   ========================================================= */
import { arcFrom3, normAng, TAU } from './geometry.js';
import { mtextLines, wrapCharsFor, aciColor } from './dxf.js';

export class DwgDbError extends Error {}

/* ---------- 2×3 affine, identical convention to dxf.js ---------- */
const xfPt  = (m,p) => ({x: m[0]*p.x + m[2]*p.y + m[4], y: m[1]*p.x + m[3]*p.y + m[5]});
const xfMul = (m,n) => [
  m[0]*n[0]+m[2]*n[1],       m[1]*n[0]+m[3]*n[1],
  m[0]*n[2]+m[2]*n[3],       m[1]*n[2]+m[3]*n[3],
  m[0]*n[4]+m[2]*n[5]+m[4],  m[1]*n[4]+m[3]*n[5]+m[5]];
const xfDet     = m => m[0]*m[3] - m[1]*m[2];
const xfScale   = m => (Math.hypot(m[0],m[1]) + Math.hypot(m[2],m[3]))/2;
const xfUniform = m => Math.abs(Math.hypot(m[0],m[1]) - Math.hypot(m[2],m[3])) < 1e-6*(xfScale(m)||1);
const xfRot     = m => Math.atan2(m[1], m[0]);

const P = p => ({x: (p && p.x) || 0, y: (p && p.y) || 0});

function arcShape(layer, c, r, a0, a1, m){
  const at = a => ({x:c.x + r*Math.cos(a), y:c.y + r*Math.sin(a)});
  const sweep = normAng(a1-a0) || TAU;
  const f = arcFrom3(xfPt(m, at(a0)), xfPt(m, at(a0+sweep/2)), xfPt(m, at(a1)));
  if (!f) return null;
  return {k:'arc', layer, c:{x:f.cx, y:f.cy}, r:f.r, a0:f.a0, a1:f.a1};
}

// entities consumed with their owner, or carrying nothing drawable
const SILENT = new Set(['ATTDEF','VERTEX','SEQEND','VIEWPORT','POINT','LIGHT','SUN','IMAGEDEF']);

/* ---------- one text-ish sub-record → IR ---------- */
function textShape(layer, t, m, report){
  const s = (t && t.text) || '';
  if (!s.trim()) return null;
  // an aligned/fitted TEXT puts its real position in endPoint
  const aligned = (t.halign || t.valign) && t.endPoint &&
                  (t.endPoint.x !== t.startPoint.x || t.endPoint.y !== t.startPoint.y);
  const p = P(aligned ? t.endPoint : t.startPoint);
  return {k:'text', layer, p:xfPt(m,p), h:(t.textHeight || 2.5)*xfScale(m),
          s, rot:(t.rotation || 0) + xfRot(m)};
}

/* ---------- hatch boundary paths → IR shapes ---------- */
function hatchShapes(e, layer, m, out, report){
  const paths = e.boundaryPaths || [];
  if (!paths.length){ report.skip('HATCH'); return; }
  const hatchId = ++report.hatch;
  const pattern = e.patternName || '';
  const solid   = !!e.solidFill;
  const tag = s => { if (s){ Object.assign(s, {hatchId, pattern, solid, frozen:true}); out.push(s); } };

  for (const path of paths){
    if (!path) continue;
    // polyline path: vertices carry bulges directly
    if (path.vertices && path.vertices.length >= 2){
      tag({k:'poly', layer, closed:path.isClosed !== false,
           pts:path.vertices.map(v => ({...xfPt(m,P(v)),
                                        bulge:(v.bulge||0) * (xfDet(m)<0 ? -1 : 1)}))});
      continue;
    }
    for (const ed of (path.edges || [])){
      if (!ed) continue;                     // real files carry null edges
      if (ed.type === 1){
        tag({k:'line', layer, a:xfPt(m,P(ed.start)), b:xfPt(m,P(ed.end))});
      } else if (ed.type === 2){
        let a0 = ed.startAngle || 0, a1 = ed.endAngle || 0;
        // hatch edge angles are degrees in the DXF spec and libredwg keeps that
        a0 = a0*Math.PI/180; a1 = a1*Math.PI/180;
        if (ed.isCCW === false) [a0,a1] = [a1,a0];
        tag(arcShape(layer, P(ed.center), ed.radius || 0, a0, a1, m));
      } else if (ed.type === 3){
        let t0 = (ed.startAngle || 0)*Math.PI/180, t1 = (ed.endAngle || 0)*Math.PI/180;
        if (ed.isCCW === false) [t0,t1] = [t1,t0];
        const maj = P(ed.majorAxisEndPoint || ed.end || {x:1,y:0});
        tag({k:'ellipse', layer, c:xfPt(m,P(ed.center)),
             maj:{x:m[0]*maj.x + m[2]*maj.y, y:m[1]*maj.x + m[3]*maj.y},
             ratio:ed.minorAxisRatio ?? ed.axisRatio ?? 1, t0, t1});
      } else if (ed.type === 4){
        tag({k:'spline', layer, deg:ed.degree || 3, knots:ed.knots || [], closed:false,
             ctrl:(ed.controlPoints || []).map(q => ({...xfPt(m,P(q)), w:q.w ?? 1})),
             fit:(ed.fitPoints || []).map(q => xfPt(m,P(q)))});
      }
    }
  }
}

/* ---------- entity list → IR ---------- */
function toShapes(ents, blocks, m, depth, out, report){
  for (const e of ents){
    if (!e || !e.type) continue;
    const layer = e.layer || '0';
    const t = e.type;
    const push = s => { if (s) out.push(s); };

    if (t === 'LINE'){
      push({k:'line', layer, a:xfPt(m,P(e.startPoint)), b:xfPt(m,P(e.endPoint))});
    }
    else if (t === 'CIRCLE'){
      const c = P(e.center), r = e.radius || 0;
      if (xfUniform(m)) push({k:'circle', layer, c:xfPt(m,c), r:r*xfScale(m)});
      else push({k:'ellipse', layer, c:xfPt(m,c),
                 maj:{x:m[0]*r, y:m[1]*r},
                 ratio:Math.hypot(m[2],m[3])/(Math.hypot(m[0],m[1])||1), t0:0, t1:TAU});
    }
    else if (t === 'ARC'){
      push(arcShape(layer, P(e.center), e.radius || 0, e.startAngle || 0, e.endAngle || 0, m));
    }
    else if (t === 'ELLIPSE'){
      const maj = P(e.majorAxisEndPoint);
      push({k:'ellipse', layer, c:xfPt(m,P(e.center)),
            maj:{x:m[0]*maj.x + m[2]*maj.y, y:m[1]*maj.x + m[3]*maj.y},
            ratio:e.axisRatio ?? 1, t0:e.startAngle ?? 0, t1:e.endAngle ?? TAU});
    }
    else if (t === 'LWPOLYLINE' || t === 'POLYLINE2D'){
      const v = e.vertices || [];
      if (v.length < 2) continue;
      push({k:'poly', layer, closed:!!((e.flag || 0) & 1),
            pts:v.map(q => ({...xfPt(m,P(q)), bulge:(q.bulge||0) * (xfDet(m)<0 ? -1 : 1)}))});
    }
    else if (t === 'POLYLINE3D'){
      const v = e.vertices || [];
      if (v.length < 2) continue;
      push({k:'poly', layer, closed:!!((e.flag || 0) & 1),
            pts:v.map(q => ({...xfPt(m,P(q)), bulge:0}))});
    }
    else if (t === 'TEXT' || t === 'ATTRIB'){
      // TEXT keeps its fields inline; ATTRIB nests them under .text
      push(textShape(layer, t === 'ATTRIB' ? e.text : e, m, report));
    }
    else if (t === 'MTEXT'){
      const h = (e.textHeight || 2.5)*xfScale(m);
      const dir = e.direction;
      const rot = (dir && (dir.x || dir.y)) ? Math.atan2(dir.y, dir.x) : (e.rotation || 0);
      const at = e.attachmentPoint || 1;
      const lines = mtextLines(e.text || '', wrapCharsFor(e.rectWidth || 0, e.textHeight || 0));
      const p0 = xfPt(m, P(e.insertionPoint));
      const ang = rot + xfRot(m), dy = h*1.6;
      const row = at<=3 ? 1 : at<=6 ? 0.5*(lines.length-1)+1 : lines.length;
      lines.forEach((s,n) => {
        if (!s) return;
        const d = (row-1-n)*dy;
        push({k:'text', layer, h, s, rot:ang,
              p:{x:p0.x - Math.sin(ang)*d, y:p0.y + Math.cos(ang)*d}});
      });
    }
    else if (t === 'DIMENSION'){
      // 0/1 = linear/aligned: the two witness points are the sub-definition points
      const kind = (e.dimensionType & 7) <= 1 ? 'aligned' : 'other';
      push({k:'dim', layer, kind,
            p1:xfPt(m, P(e.subDefinitionPoint1)),
            p2:xfPt(m, P(e.subDefinitionPoint2)),
            dp:xfPt(m, P(e.definitionPoint))});
    }
    else if (t === 'SPLINE'){
      const ctrl = (e.controlPoints || []).map(q => ({...xfPt(m,P(q)), w:q.w ?? 1}));
      const fit  = (e.fitPoints || []).map(q => xfPt(m,P(q)));
      if (!ctrl.length && !fit.length) continue;
      push({k:'spline', layer, ctrl, fit, knots:e.knots || [],
            deg:e.degree || 3, closed:!!((e.flag || 0) & 1)});
    }
    else if (t === 'SOLID' || t === 'TRACE' || t === '3DFACE'){
      const q = [P(e.corner1), P(e.corner2), P(e.corner4 || e.corner3), P(e.corner3)];
      push({k:'solid', layer, pts:q.map(p => xfPt(m,p))});
    }
    else if (t === 'LEADER'){
      const v = e.vertices || e.points || [];
      if (v.length >= 2)
        push({k:'poly', layer, closed:false, pts:v.map(q => ({...xfPt(m,P(q)), bulge:0}))});
    }
    else if (t === 'HATCH'){
      hatchShapes(e, layer, m, out, report);
    }
    else if (t === 'INSERT'){
      const blk = blocks.get(e.name);
      if (!blk){ report.skip(`INSERT ${e.name}`); }
      else if (depth >= 8){ report.skip('INSERT (nested too deep)'); }
      else {
        const sx = e.xScale || 1, sy = e.yScale || 1, rot = e.rotation || 0;
        const cols = Math.max(1, e.columnCount|0 || 1), rows = Math.max(1, e.rowCount|0 || 1);
        const cs = e.columnSpacing || 0, rs = e.rowSpacing || 0;
        const ins = P(e.insertionPoint), base = P(blk.basePoint);
        const co = Math.cos(rot), si = Math.sin(rot);
        for (let cx=0; cx<cols; cx++) for (let ry=0; ry<rows; ry++){
          const local = xfMul([co,si,-si,co, ins.x + cx*cs, ins.y + ry*rs],
                              [sx,0,0,sy, -base.x*sx, -base.y*sy]);
          toShapes(blk.entities || [], blocks, xfMul(m, local), depth+1, out, report);
        }
      }
      // ATTRIBs travel with the instance and are already in world coordinates
      for (const a of (e.attribs || [])){
        if (a.isInvisible || ((a.flags|0) & 1)) continue;
        push(textShape(a.layer || layer, a.text, m, report));
      }
    }
    else if (!SILENT.has(t)) report.skip(t);
  }
}

/* ---------- $INSUNITS: see the long note in dxf.js — never rescale ---------- */
const INSUNITS = {4:'mm', 5:'cm', 6:'m'};
const UNIT_NAME = {1:'inches', 2:'feet', 3:'miles', 7:'kilometres', 10:'yards',
                   14:'decimetres', 15:'decametres', 16:'hectometres'};

/* DwgDatabase → the IR that cadimport.importDoc() consumes. */
export function dwgDocToIR(db){
  if (!db || !db.tables) throw new DwgDbError('That DWG could not be read.');

  const report = { skipped:{}, hatch:0, skip(t){ this.skipped[t] = (this.skipped[t]||0)+1; } };

  const layers = [];
  for (const l of Object.values(db.tables.LAYER?.entries || {})){
    if (!l || !l.name) continue;
    const tc = (typeof l.color === 'number' && l.color !== 16777215) ? l.color : null;
    layers.push({
      name: l.name,
      color: tc !== null ? '#'+((tc|0)&0xffffff).toString(16).padStart(6,'0')
                         : aciColor(Math.abs(l.colorIndex ?? 7)),
      off:    !!l.off || !!l.frozen || (l.colorIndex ?? 7) < 0,
      locked: !!l.locked,
    });
  }

  // block definitions by name; the two spaces are layouts, not blocks
  const blocks = new Map();
  const missingRefs = [];
  let model = null;
  for (const b of Object.values(db.tables.BLOCK_RECORD?.entries || {})){
    if (!b || !b.name) continue;
    if (/^\*Model_Space/i.test(b.name)){ model = b; continue; }
    if (/^\*Paper_Space/i.test(b.name)) continue;
    // flag bit 4 = external reference. An xref with no geometry was never
    // resolved: the drawing it points at is simply not in this file, so the
    // walls/furniture the user expects are not here to import.
    if (((b.flags | 0) & 4) && !(b.entities || []).length) missingRefs.push(b.name);
    blocks.set(b.name, b);
  }
  // Import model space — the building. Paper space is a presentation sheet of
  // viewports onto it, which MiniCAD has no concept of.
  const ents = (model && model.entities) || db.entities || [];
  if (!ents.length) throw new DwgDbError('That DWG has nothing in its model space.');

  const code = parseInt(db.header?.INSUNITS, 10);
  const shapes = [];
  toShapes(ents, blocks, [1,0,0,1,0,0], 0, shapes, report);

  return {shapes, layers, missingRefs,
          units: INSUNITS[code] || null,
          foreignUnit: (!INSUNITS[code] && UNIT_NAME[code]) || null,
          skipped: report.skipped, hatch: report.hatch};
}
