/* =========================================================
   MiniCAD — event wiring & boot
   ========================================================= */
import { fmt } from './geometry.js';
import { entities, setEntities, layers, currentLayer, setCurrentLayer, layerOf, snapshot,
         undoStack, view, T, cmd, selection, mouse, curPt, setCurPt, boxSel, setBoxSel,
         setHoverSel, setHotGrip, units, unitFmt } from './state.js';
import './plotui.js';                                   // print dialog wiring (self-registers)
import './osnapui.js';                                  // object-snap dialog wiring (self-registers)
import { findEntityAt, translateIds, entGrips, applyGrip } from './entities.js';
import { cv, s2w, w2s, draw, resize, zoomExtents, RULER_PX, W, H } from './view.js';
import { startCommand, handleEnter, cancelCmd, applyModifiers,
         doUndo, doRedo, setTog, clickSelect, boxSelect, onPoint, startEditText } from './commands.js';
import { cmdInput, coordRead, layerSel, layerColor, btnLayerOff, btnLayerLock, log, setPrompt,
         toggleHelp, refreshLayers } from './ui.js';
import { saveJSON, openJSON, dxfExport, autosaveTick, restoreAutosave } from './io.js';

let panning = null;
let spaceHeld = false;
let dragging = null;   // {sx,sy,lastW,moved} — direct drag-move of the selection
let gripDrag = null;   // {ent,g,sx,sy,moved} — dragging a grip to reshape

function findGripAt(sx, sy){
  const tol = 7;
  let best=null, bd=tol;
  for (const e of entities){
    if (!selection.has(e.id)) continue;
    for (const g of entGrips(e)){
      const s = w2s(g);
      const d = Math.max(Math.abs(s.x-sx), Math.abs(s.y-sy));
      if (d<=bd){ bd=d; best={ent:e, g:g.g}; }
    }
  }
  return best;
}

/* ================= canvas events ================= */
window.addEventListener('resize', resize);

cv.addEventListener('mousemove', ev=>{
  const r=cv.getBoundingClientRect();
  mouse.sx=ev.clientX-r.left; mouse.sy=ev.clientY-r.top; mouse.inside=true;
  if (panning){
    view.ox += mouse.sx-panning.x; view.oy += mouse.sy-panning.y;
    panning={x:mouse.sx,y:mouse.sy};
  }
  if (boxSel){ boxSel.x1=mouse.sx; boxSel.y1=mouse.sy; }
  if (dragging){
    const w = s2w(mouse.sx, mouse.sy);
    if (!dragging.moved && (Math.abs(mouse.sx-dragging.sx)>4 || Math.abs(mouse.sy-dragging.sy)>4)){
      dragging.moved = true; snapshot();          // one undo step per drag
    }
    if (dragging.moved){ translateIds([...selection], w.x-dragging.lastW.x, w.y-dragging.lastW.y); dragging.lastW = w; }
  }
  if (gripDrag){
    setCurPt(applyModifiers(s2w(mouse.sx, mouse.sy), gripDrag.ent.id));   // snap, but not to itself
    if (!gripDrag.moved && (Math.abs(mouse.sx-gripDrag.sx)>4 || Math.abs(mouse.sy-gripDrag.sy)>4)){
      gripDrag.moved = true; snapshot();          // one undo step per grip edit
    }
    if (gripDrag.moved) applyGrip(gripDrag.ent, gripDrag.g, curPt);
  } else {
    setCurPt(applyModifiers(s2w(mouse.sx, mouse.sy)));
  }
  const hov = (!cmd && !boxSel && !gripDrag && selection.size) ? findEntityAt(s2w(mouse.sx, mouse.sy)) : null;
  setHoverSel(!!dragging || !!(hov && selection.has(hov.id)));
  coordRead.textContent = `${unitFmt(curPt.x)}, ${unitFmt(curPt.y)} ${units}` + (T.ortho?'  ORTHO':'') ;
  cv.style.cursor = (cmd && cmd.name==='PAN') ? (panning ? 'grabbing' : 'grab') : 'none';
  syncPanBtn();
  draw();
});
cv.addEventListener('mouseleave', ()=>{ mouse.inside=false; draw(); });

cv.addEventListener('mousedown', ev=>{
  cmdInput.focus();
  { const r=cv.getBoundingClientRect();               // don't trust the last mousemove
    mouse.sx=ev.clientX-r.left; mouse.sy=ev.clientY-r.top; }
  if (ev.button===1 || (ev.button===0 && spaceHeld)){
    panning={x:mouse.sx,y:mouse.sy}; ev.preventDefault(); return;
  }
  if (ev.button!==0) return;
  if (cmd && cmd.name==='PAN'){                       // hand tool: left-drag pans
    panning={x:mouse.sx, y:mouse.sy}; return;
  }
  if (mouse.sx <= RULER_PX || mouse.sy <= RULER_PX) return;   // clicks on the rulers are inert
  const needsPoint = cmd && cmd.step!=='select' && cmd.step!=='dist' && cmd.step!=='height' && cmd.step!=='string' && cmd.step!=='factor';
  if (cmd && ((cmd.name==='OFFSET' && cmd.step==='pick') || (cmd.name==='TRIM' && cmd.step==='trim') ||
              (cmd.name==='EXTEND' && cmd.step==='extend') ||
              (cmd.name==='FILLET' && (cmd.step==='first'||cmd.step==='second')))){ onPoint(s2w(mouse.sx,mouse.sy)); return; }
  if (needsPoint && cmd.name!=='ZOOM'){ onPoint(curPt); return; }
  // grips first, then drag-move: press on a grip / selected object (idle only)
  if (!cmd){
    const grip = findGripAt(mouse.sx, mouse.sy);
    if (grip){
      gripDrag = {ent:grip.ent, g:grip.g, sx:mouse.sx, sy:mouse.sy, moved:false};
      setHotGrip({id:grip.ent.id, g:grip.g});
      draw(); return;
    }
    const hit = findEntityAt(s2w(mouse.sx, mouse.sy));
    if (hit && selection.has(hit.id)){
      dragging = {sx:mouse.sx, sy:mouse.sy, lastW:s2w(mouse.sx,mouse.sy), moved:false};
      return;
    }
  }
  // selection (idle, or inside a command's select step)
  setBoxSel({x0:mouse.sx,y0:mouse.sy,x1:mouse.sx,y1:mouse.sy, shift:ev.shiftKey});
});
window.addEventListener('mouseup', ev=>{
  if (ev.button===1 || panning){ panning=null; }
  if (ev.button===0 && gripDrag){
    if (gripDrag.moved) log('Grip edit.', 'r');
    setHotGrip(null); gripDrag=null; draw();
  }
  if (ev.button===0 && dragging){
    if (dragging.moved) log(`Moved ${selection.size}.`, 'r');
    else clickSelect(s2w(dragging.sx, dragging.sy), true);   // plain click still toggles selection
    dragging=null; draw();
  }
  if (ev.button===0 && boxSel){
    const moved = Math.abs(boxSel.x1-boxSel.x0)>4 || Math.abs(boxSel.y1-boxSel.y0)>4;
    if (moved) boxSelect(boxSel, boxSel.x1<boxSel.x0);
    else clickSelect(s2w(boxSel.x0,boxSel.y0), true);
    setBoxSel(null);
    if (cmd && cmd.step==='select'){
      setPrompt(`${cmd.name} — ${selection.size} selected. Add more, or Enter to continue:`);
      cmd.sel=[...selection];
    }
    draw();
  }
});
cv.addEventListener('wheel', ev=>{
  ev.preventDefault();
  const f = ev.deltaY<0 ? 1.15 : 1/1.15;
  const wp = s2w(mouse.sx, mouse.sy);
  view.scale = Math.min(2000, Math.max(0.001, view.scale*f));
  view.ox = mouse.sx - wp.x*view.scale;
  view.oy = mouse.sy + wp.y*view.scale;
  draw();
}, {passive:false});
cv.addEventListener('dblclick', ev=>{
  if (cmd) return;
  const e = findEntityAt(s2w(mouse.sx, mouse.sy));
  if (e && e.type==='text'){ startEditText(e); cmdInput.focus(); }
});
cv.addEventListener('contextmenu', ev=>{
  ev.preventDefault();
  handleEnter(cmdInput.value); cmdInput.value='';
  syncPanBtn();
});

/* ================= keyboard ================= */
cmdInput.addEventListener('keydown', ev=>{
  const typingText = cmd && cmd.step==='string';        // spaces allowed inside TEXT strings
  if (ev.key==='Enter' || (ev.key===' ' && !typingText)){
    ev.preventDefault();
    handleEnter(cmdInput.value); cmdInput.value='';
    syncPanBtn();
  }
});
window.addEventListener('keydown', ev=>{
  if (ev.key==='F8'){ ev.preventDefault(); setTog('ortho'); return; }
  if (ev.key==='F3'){ ev.preventDefault(); setTog('osnap'); return; }
  if (ev.key==='F7'){ ev.preventDefault(); setTog('grid'); return; }
  if (ev.key==='F9'){ ev.preventDefault(); setTog('snap'); return; }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase()==='p'){
    ev.preventDefault(); startCommand('PLOT'); return;
  }
  if (ev.key==='Escape'){
    if (gripDrag){                                 // abort grip edit: put things back
      if (gripDrag.moved) setEntities(JSON.parse(undoStack.pop()));
      setHotGrip(null); gripDrag=null; draw(); return;
    }
    if (dragging){                                 // abort drag: put things back
      if (dragging.moved) setEntities(JSON.parse(undoStack.pop()));
      dragging=null; draw(); return;
    }
    if (boxSel){ setBoxSel(null); draw(); return; }
    if (cmd) cancelCmd();
    else { selection.clear(); draw(); }
    syncPanBtn();
    cmdInput.value=''; return;
  }
  if ((ev.key==='Delete'||ev.key==='Backspace') && !cmd && document.activeElement===cmdInput && !cmdInput.value && selection.size){
    ev.preventDefault();
    snapshot();
    setEntities(entities.filter(e=>!selection.has(e.id)));
    log(`Erased ${selection.size}.`, 'r');
    selection.clear(); draw(); return;
  }
  if (ev.key===' ' && document.activeElement!==cmdInput){ spaceHeld=true; }
  if (ev.ctrlKey && ev.key.toLowerCase()==='z'){ ev.preventDefault(); ev.shiftKey?doRedo():doUndo(); return; }
  if (document.activeElement!==cmdInput && !ev.ctrlKey && !ev.metaKey && ev.key.length===1) cmdInput.focus();
});
window.addEventListener('keyup', ev=>{ if (ev.key===' ') spaceHeld=false; });

/* ================= toggles / UI ================= */
['grid','snap','ortho','osnap'].forEach(k=>{
  const map={grid:'tGrid',snap:'tSnap',ortho:'tOrtho',osnap:'tOsnap'};
  document.getElementById(map[k]).addEventListener('click', ()=>setTog(k));
});
document.querySelectorAll('#topbar .btn[data-cmd]').forEach(b=>{
  b.addEventListener('click', ()=>{ startCommand(b.dataset.cmd); cmdInput.focus(); });
});
/* pan toggle button: lit while the hand tool is active */
const btnPan = document.getElementById('btnPan');
function syncPanBtn(){ btnPan.classList.toggle('on', !!(cmd && cmd.name==='PAN')); }
btnPan.addEventListener('click', ()=>{
  if (cmd && cmd.name==='PAN') cancelCmd(true);
  else startCommand('PAN');
  syncPanBtn(); cmdInput.focus();
});

document.getElementById('btnUndo').addEventListener('click', doUndo);
document.getElementById('btnHelp').addEventListener('click', ()=>toggleHelp());
document.getElementById('helpClose').addEventListener('click', ()=>toggleHelp(false));

/* layers */
layerSel.addEventListener('change', ()=>{ setCurrentLayer(layerSel.value); layerColor.value=layerOf(currentLayer).color; cmdInput.focus(); });
layerColor.addEventListener('input', ()=>{ layerOf(currentLayer).color=layerColor.value; draw(); });
btnLayerOff.addEventListener('click', ()=>{
  const l = layerOf(currentLayer);
  l.off = !l.off;
  if (l.off){
    for (const e of entities) if (e.layer===currentLayer) selection.delete(e.id);
    log(`Layer "${currentLayer}" hidden — objects on it are invisible and untouchable. Note: you're still drawing on it!`);
  } else log(`Layer "${currentLayer}" visible again.`, 'r');
  refreshLayers(); draw();
});
btnLayerLock.addEventListener('click', ()=>{
  const l = layerOf(currentLayer);
  l.locked = !l.locked;
  if (l.locked) for (const e of entities) if (e.layer===currentLayer) selection.delete(e.id);
  log(`Layer "${currentLayer}" ${l.locked?'locked — visible and snappable, but can\'t be selected or changed.':'unlocked.'}`);
  refreshLayers(); draw();
});
document.getElementById('btnAddLayer').addEventListener('click', ()=>{
  const name=prompt('New layer name:');
  if (!name||layers.some(l=>l.name===name)) return;
  layers.push({name, color:'#a9e04f'});
  setCurrentLayer(name); refreshLayers(); draw();
});

/* save / open / DXF */
document.getElementById('btnSave').addEventListener('click', saveJSON);
document.getElementById('btnOpen').addEventListener('click', ()=>document.getElementById('fileIn').click());
document.getElementById('fileIn').addEventListener('change', ev=>{
  const f=ev.target.files[0]; if(!f) return;
  openJSON(f);
  ev.target.value='';
});
document.getElementById('btnDxf').addEventListener('click', dxfExport);

/* ================= boot ================= */
function boot(){
  resize();
  view.ox = W*0.5; view.oy = H*0.6;
  log('MiniCAD ready. Type a command — L (line), REC, C (circle)… or press ? for help.', 'r');
  log('Right-click = Enter · F8 ortho · F3 osnap · wheel zoom · middle-drag pan');
  if (restoreAutosave()){
    zoomExtents();
    log(`Restored autosaved drawing (${entities.length} objects) — type NEW to start fresh.`, 'r');
  }
  refreshLayers();
  cmdInput.focus();
  draw();
}
boot();
setInterval(autosaveTick, 5000);                         // quiet safety net
window.addEventListener('beforeunload', autosaveTick);
