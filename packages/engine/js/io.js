/* =========================================================
   MiniCAD — save / open / DXF export
   ========================================================= */
import { normAng, fmt } from './geometry.js';
import { dimGeom, dimH } from './entities.js';
import { entities, setEntities, layers, setLayers, getIdSeq, setIdSeq,
         setCurrentLayer, snapshot, selection, units, setUnits } from './state.js';
import { zoomExtents } from './view.js';
import { log, refreshLayers } from './ui.js';

export function download(name, data, mime){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([data],{type:mime}));
  a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
}

export function saveJSON(){
  download('drawing.json', JSON.stringify({layers, entities, idSeq:getIdSeq(), units}, null, 1), 'application/json');
  log('Saved drawing.json', 'r');
}

export function openJSON(f){
  const r=new FileReader();
  r.onload=()=>{
    try{
      const d=JSON.parse(r.result);
      snapshot();
      setLayers(d.layers||layers); setEntities(d.entities||[]); setIdSeq(d.idSeq||entities.length+1);
      setUnits(d.units||'cm');
      setCurrentLayer(layers[0].name); refreshLayers(); selection.clear(); zoomExtents();
      log(`Opened ${f.name} (${entities.length} objects).`, 'r');
    }catch(e){ log('Could not read that file.', 'e'); }
  };
  r.readAsText(f);
}

/* ---------- autosave (localStorage) ---------- */
const AUTOSAVE_KEY = 'minicad.autosave';
let lastAutosave = '';

export function autosaveTick(){
  if (typeof localStorage === 'undefined') return;
  const data = JSON.stringify({layers, entities, idSeq:getIdSeq(), units});
  if (data !== lastAutosave){
    try{ localStorage.setItem(AUTOSAVE_KEY, data); lastAutosave = data; }catch(e){ /* storage full/blocked */ }
  }
}
export function restoreAutosave(){
  if (typeof localStorage === 'undefined') return false;
  const raw = localStorage.getItem(AUTOSAVE_KEY);
  if (!raw) return false;
  try{
    const d = JSON.parse(raw);
    if (!d.entities || !d.entities.length) return false;
    setLayers(d.layers||layers); setEntities(d.entities); setIdSeq(d.idSeq||d.entities.length+1);
    setUnits(d.units||'cm');
    setCurrentLayer(layers[0].name);
    lastAutosave = raw;
    return true;
  }catch(e){ return false; }
}
export function clearAutosave(){
  if (typeof localStorage !== 'undefined') localStorage.removeItem(AUTOSAVE_KEY);
  lastAutosave = '';
}

export function dxfExport(){
  const L=[];
  const push=(...a)=>L.push(...a);
  push('0','SECTION','2','HEADER','9','$ACADVER','1','AC1009','0','ENDSEC');
  push('0','SECTION','2','TABLES','0','TABLE','2','LAYER','70',String(layers.length));
  for (const l of layers) push('0','LAYER','2',l.name,'70',l.locked?'4':'0','62',l.off?'-7':'7','6','CONTINUOUS');
  push('0','ENDTAB','0','ENDSEC');
  push('0','SECTION','2','ENTITIES');
  for (const e of entities){
    if (e.type==='line')
      push('0','LINE','8',e.layer,'10',e.x1,'20',e.y1,'30','0','11',e.x2,'21',e.y2,'31','0');
    else if (e.type==='circle')
      push('0','CIRCLE','8',e.layer,'10',e.cx,'20',e.cy,'30','0','40',e.r);
    else if (e.type==='arc')
      push('0','ARC','8',e.layer,'10',e.cx,'20',e.cy,'30','0','40',e.r,
           '50',normAng(e.a0)*180/Math.PI,'51',normAng(e.a1)*180/Math.PI);
    else if (e.type==='pline'){
      push('0','POLYLINE','8',e.layer,'66','1','70', e.closed?'1':'0');
      for (const p of e.pts) push('0','VERTEX','8',e.layer,'10',p.x,'20',p.y,'30','0');
      push('0','SEQEND');
    }
    else if (e.type==='text')
      push('0','TEXT','8',e.layer,'10',e.x,'20',e.y,'30','0','40',e.h,'1',e.str);
    else if (e.type==='dim'){
      // exported as plain lines + text so it opens everywhere without block definitions
      const g=dimGeom(e);
      push('0','LINE','8',e.layer,'10',e.x1,'20',e.y1,'30','0','11',g.a.x,'21',g.a.y,'31','0');
      push('0','LINE','8',e.layer,'10',e.x2,'20',e.y2,'30','0','11',g.b.x,'21',g.b.y,'31','0');
      push('0','LINE','8',e.layer,'10',g.a.x,'20',g.a.y,'30','0','11',g.b.x,'21',g.b.y,'31','0');
      const h=dimH(e);
      const ang=Math.atan2(e.y2-e.y1, e.x2-e.x1);
      const deg=(a=>{ a=a*180/Math.PI; if (a>90||a<=-90) a+=180; return ((a%360)+360)%360; })(ang);
      push('0','TEXT','8',e.layer,'10',(g.a.x+g.b.x)/2,'20',(g.a.y+g.b.y)/2,'30','0',
           '40',h,'50',deg,'72','1','11',(g.a.x+g.b.x)/2,'21',(g.a.y+g.b.y)/2,'31','0','1',fmt(g.L));
    }
  }
  push('0','ENDSEC','0','EOF');
  download('drawing.dxf', L.join('\n'), 'application/dxf');
  log('Exported drawing.dxf — opens in AutoCAD, LibreCAD, QCAD…', 'r');
}
