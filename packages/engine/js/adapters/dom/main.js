/* =========================================================
   MiniCAD — event wiring & boot
   ========================================================= */
import { fmt } from '../../core/geometry.js';
import { entities, setEntities, layers, currentLayer, setCurrentLayer, layerOf, snapshot,
         undoStack, view, T, cmd, selection, mouse, curPt, setCurPt, boxSel, setBoxSel,
         setHoverSel, setHotGrip, setSnapMark, setTrackGuides, units, unitFmt,
         sugSel, setSugSel } from '../../core/state.js';
import './plotui.js';                                   // print dialog wiring (self-registers)
import './osnapui.js';                                  // object-snap dialog wiring (self-registers)
import './colorui.js';                                  // layer color palette / ACI picker (self-registers)
import './hatchui.js';                                  // hatch material picker (self-registers)
import './symbolui.js';                                 // symbol library picker (self-registers)
import { findEntityAt, translateIds, entGrips, applyGrip } from '../../core/entities.js';
import { cv, s2w, w2s, draw, resize, zoomExtents, RULER_PX, W, H } from './view.js';
import { startCommand, handleEnter, cancelCmd, applyModifiers, eraseWithDependents,
         doUndo, doRedo, setTog, clickSelect, boxSelect, onPoint, startEditText,
         parsePoint, suggestCommands } from '../../core/commands.js';
import { cmdInput, caretToEnd, coordRead, layerCur, layerColor, log, setPrompt,
         toggleHelp, refreshLayers } from './ui.js';
import { saveJSON, openJSON, openDXF, openDWG, dxfExport, autosaveTick, restoreAutosave } from './io.js';

/* focus() on an editable div leaves the caret wherever the browser last had it
   — at the start, for a field prefilled by EDITTEXT. Always type at the end. */
function focusCmd(){ cmdInput.focus(); caretToEnd(cmdInput); }

/* Is the board actually asking for a coordinate right now?
   Object snap is a point-entry aid, so it belongs to point entry — AutoCAD only
   shows a marker once a command wants a point. Snapping while merely moving the
   mouse yanks the crosshair around a busy imported plan for no reason, and on
   22,000 entities it also does a spatial query and a bucket of candidate maths
   on every single mousemove. Dragging a selection or a grip counts: those are
   point entry by another name. The step list matches the one mousedown uses to
   decide whether a click IS a point — the two must agree. */
const PICKS_OBJECTS = new Set(['OFFSET','TRIM','EXTEND','FILLET']);   // and PAN/ZOOM want no point at all
function wantsAPoint(){
  if (dragging) return true;
  if (!cmd || cmd.name === 'PAN' || cmd.name === 'ZOOM') return false;
  // these ask you to click a LINE, not a location — mousedown passes them the
  // raw cursor for exactly that reason, so a snap marker is a lie
  if (PICKS_OBJECTS.has(cmd.name)) return false;
  return cmd.step !== 'select' && cmd.step !== 'dist' && cmd.step !== 'height'
      && cmd.step !== 'string' && cmd.step !== 'factor';
}

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
  } else if (wantsAPoint()){
    setCurPt(applyModifiers(s2w(mouse.sx, mouse.sy)));
  } else {
    // idle: no markers, no magnetism, and none of the work behind them
    setSnapMark(null); setTrackGuides(null);
    setCurPt(s2w(mouse.sx, mouse.sy));
  }
  showTyped();
  const hov = (!cmd && !boxSel && !gripDrag && selection.size) ? findEntityAt(s2w(mouse.sx, mouse.sy)) : null;
  setHoverSel(!!dragging || !!(hov && selection.has(hov.id)));
  coordRead.textContent = `${unitFmt(curPt.x)}, ${unitFmt(curPt.y)} ${units}` + (T.ortho?'  ORTHO':'') ;
  cv.style.cursor = (cmd && cmd.name==='PAN') ? (panning ? 'grabbing' : 'grab') : 'none';
  syncPanBtn();
  draw();
});
cv.addEventListener('mouseleave', ()=>{ mouse.inside=false; draw(); });

cv.addEventListener('mousedown', ev=>{
  focusCmd();
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
  if (e && e.type==='text'){ startEditText(e); focusCmd(); }
});
cv.addEventListener('contextmenu', ev=>{
  ev.preventDefault();
  submitCmdLine();
});

/* ================= keyboard ================= */
/* Type 0.2 while drawing and the rubber band should already be 200 mm long,
   swinging with the mouse — you aim, you do not guess. The maths for it was
   always there (parsePoint: a bare number is a distance along the cursor
   direction, and 3,4 or @3<45 are points), but it only ran on Enter, so until
   you committed there was nothing to see. Same function, applied a keystroke
   earlier: whatever Enter would do, the preview is already showing. */
function showTyped(){
  if (!cmd) return;
  const p = cmdInput.value.trim() ? parsePoint(cmdInput.value) : null;
  if (p && isFinite(p.x) && isFinite(p.y)){ setSnapMark(null); setCurPt(p); }
}
cmdInput.addEventListener('input', ()=>{ setSugSel(0); showTyped(); draw(); });   // dynamic input mirrors keystrokes live
/* command autocomplete (AutoCAD-style): while idle, typed letters list the
   matching commands at the cursor; ↑/↓ choose, Tab completes, Enter/Space/
   right-click runs the highlighted one — so PLI ⏎ runs PLINE, not an error */
// the popup only renders while dynamic input is on and the cursor is on the
// board (drawDynInput's gates) — keys must not act on a list nobody can see
const sugsShowing = () => (!cmd && T.dyn && mouse.inside) ? suggestCommands(cmdInput.value) : [];
function submitCmdLine(){
  const sugs = sugsShowing();
  handleEnter(sugs.length ? sugs[Math.min(sugSel, sugs.length-1)].alias : cmdInput.value);
  cmdInput.value=''; setSugSel(0);
  syncPanBtn();
}
cmdInput.addEventListener('keydown', ev=>{
  const typingText = cmd && cmd.step==='string';        // spaces allowed inside TEXT strings
  const sugs = sugsShowing();
  if (sugs.length){
    if (ev.key==='ArrowDown'){ ev.preventDefault(); setSugSel((sugSel+1)%sugs.length); draw(); return; }
    if (ev.key==='ArrowUp'){ ev.preventDefault(); setSugSel((sugSel+sugs.length-1)%sugs.length); draw(); return; }
    if (ev.key==='Tab'){ ev.preventDefault(); cmdInput.value = sugs[Math.min(sugSel, sugs.length-1)].alias; setSugSel(0); draw(); return; }
  }
  if (ev.key==='Enter' || (ev.key===' ' && !typingText)){
    ev.preventDefault();
    submitCmdLine();
  }
});
/* an editable div would happily take a multi-line paste; a command line is one
   line, so flatten it and insert it as plain text */
cmdInput.addEventListener('paste', ev=>{
  const txt = ev.clipboardData && ev.clipboardData.getData('text');
  if (txt == null) return;
  ev.preventDefault();
  const flat = txt.replace(/\s+/g, ' ');
  if (typeof document.execCommand === 'function') document.execCommand('insertText', false, flat);
  else { cmdInput.value = cmdInput.value + flat; }
  if (T.dyn) draw();
});
// typing in some OTHER editable element (a host app's input, the plot dialog's
// number field…): the board must keep its hands off — no focus stealing, no
// Esc-cancel, no space-pan. The engine's own command line stays exempt.
function foreignInputFocused(){
  const t = document.activeElement;
  if (!t || t === cmdInput) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable === true;
}

window.addEventListener('keydown', ev=>{
  if (foreignInputFocused()){
    if (ev.key === 'Escape') document.activeElement.blur();   // Esc hands focus back to the board
    return;
  }
  if (ev.key==='F8'){ ev.preventDefault(); setTog('ortho'); return; }
  if (ev.key==='F3'){ ev.preventDefault(); setTog('osnap'); return; }
  if (ev.key==='F7'){ ev.preventDefault(); setTog('grid'); return; }
  if (ev.key==='F9'){ ev.preventDefault(); setTog('snap'); return; }
  if (ev.key==='F12'){ ev.preventDefault(); setTog('dyn'); return; }
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
  // Delete erases the selection. This used to insist the command line held
  // focus, so it did nothing at all after clicking a toolbar button or a layer
  // row — foreignInputFocused() above has already let real text fields keep the
  // key, and the command line's own contents are the only thing left to protect.
  if ((ev.key==='Delete'||ev.key==='Backspace') && !cmd && !cmdInput.value && selection.size){
    ev.preventDefault();
    snapshot();
    const gone = eraseWithDependents([...selection]);
    log(`Erased ${gone}.`, 'r');
    selection.clear(); draw(); return;
  }
  if (ev.key===' ' && document.activeElement!==cmdInput){ spaceHeld=true; }
  // ⌘Z as well as Ctrl-Z: this is a Mac-first tool and Ctrl-Z alone means undo
  // simply did not answer there. ⌘⇧Z / Ctrl-⇧Z redo.
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase()==='z'){
    ev.preventDefault(); ev.shiftKey ? doRedo() : doUndo(); return;
  }
  /* type-anywhere: a printable key pressed on the board goes to the command
     line. An <input> received the keystroke itself the moment it was focused;
     an editable div is not reliably given it mid-keydown, so replay the
     character by hand. Space is excluded — on the board it arms the pan, and
     no command starts with one. */
  if (document.activeElement!==cmdInput && !ev.ctrlKey && !ev.metaKey
      && ev.key.length===1 && ev.key!==' '){
    ev.preventDefault();
    focusCmd();
    cmdInput.value = cmdInput.value + ev.key;
    setSugSel(0);
    if (T.dyn) draw();
  }
});
window.addEventListener('keyup', ev=>{ if (ev.key===' ') spaceHeld=false; });

/* ================= toggles / UI ================= */
['grid','snap','ortho','osnap','dyn'].forEach(k=>{
  const map={grid:'tGrid',snap:'tSnap',ortho:'tOrtho',osnap:'tOsnap',dyn:'tDyn'};
  const el = document.getElementById(map[k]);
  el.classList.toggle('on', !!T[k]);   // markup can't know the defaults — sync at boot
  el.addEventListener('click', ()=>setTog(k));
});
document.querySelectorAll('#topbar .btn[data-cmd]').forEach(b=>{
  b.addEventListener('click', ()=>{ startCommand(b.dataset.cmd); focusCmd(); });
});
/* pan toggle button: lit while the hand tool is active */
const btnPan = document.getElementById('btnPan');
function syncPanBtn(){ btnPan.classList.toggle('on', !!(cmd && cmd.name==='PAN')); }
btnPan.addEventListener('click', ()=>{
  if (cmd && cmd.name==='PAN') cancelCmd(true);
  else startCommand('PAN');
  syncPanBtn(); focusCmd();
});

document.getElementById('btnUndo').addEventListener('click', doUndo);
document.getElementById('btnHelp').addEventListener('click', ()=>toggleHelp());
document.getElementById('helpClose').addEventListener('click', ()=>toggleHelp(false));

/* layers — the bar is a readout plus a colour and a +; everything else is the
   panel, so there is exactly one place to hide, lock, delete or switch a layer.
   The colour swatch opens the ACI palette (colorui.js wires its own click). */
/* ---- keep browser autofill off the layer filter ----
   Safari offers saved credit cards on a lone text field. It does skip a field
   that is READONLY at the moment it gains focus, so this one ships readonly and
   drops it in the focus handler — synchronously, so typing is never blocked.
   Restored on blur so the next focus gets the same treatment. The command line
   went further and stopped being an <input> at all (see ui.js asTextField);
   the filter keeps its .select() and stays a real field. */
{
  const el = document.getElementById('layerFind');
  if (el && typeof el.setAttribute === 'function'){
    el.setAttribute('readonly', '');
    el.addEventListener('focus', ()=>el.removeAttribute('readonly'));
    el.addEventListener('blur',  ()=>el.setAttribute('readonly', ''));
  }
}

/* ---- layer panel ---- */
const layersPanel = document.getElementById('layers');
const layerListEl = document.getElementById('layerList');
const layerFindEl = document.getElementById('layerFind');
const setPanel = open => {
  layersPanel.classList.toggle('open', open);
  if (open){ refreshLayers(); layerFindEl.focus(); layerFindEl.select(); }
  else focusCmd();
};
layerCur.addEventListener('click', ()=>
  setPanel(!layersPanel.classList.contains('open')));
document.getElementById('layersClose').addEventListener('click', ()=>setPanel(false));
layerFindEl.addEventListener('input', refreshLayers);
layerFindEl.addEventListener('keydown', ev=>{
  ev.stopPropagation();                       // the canvas listens for bare keys
  if (ev.key==='Escape') setPanel(false);
});

layerListEl.addEventListener('click', ev=>{
  const row = ev.target.closest('.row'); if (!row) return;
  const name = row.dataset.layer, l = layerOf(name);
  const act = ev.target.dataset && ev.target.dataset.act;

  if (act==='off'){
    l.off = !l.off;
    if (l.off) for (const e of entities) if (e.layer===name) selection.delete(e.id);
    log(`Layer "${name}" ${l.off?'hidden':'visible again'}.`, 'r');
  } else if (act==='lock'){
    l.locked = !l.locked;
    if (l.locked) for (const e of entities) if (e.layer===name) selection.delete(e.id);
    log(`Layer "${name}" ${l.locked?'locked':'unlocked'}.`, 'r');
  } else if (act==='del'){
    if (name==='0'){ log('Layer "0" is the default layer and cannot be deleted.', 'e'); return; }
    const n = entities.filter(e=>e.layer===name).length;
    if (n && !confirm(`Delete layer "${name}" and its ${n} object${n>1?'s':''}?`)) return;
    startCommand('LAYDEL'); handleEnter(name);   // one snapshot, undoable, hatches handled
  } else {
    setCurrentLayer(name);                        // clicking the row picks the layer
  }
  refreshLayers(); draw();
});

document.getElementById('layAllOn').addEventListener('click', ()=>{
  let n=0; for (const l of layers) if (l.off){ l.off=false; n++; }
  log(n ? `Turned ${n} layer${n>1?'s':''} back on.` : 'Every layer is already visible.', 'r');
  refreshLayers(); draw();
});
/* The file's own locks, lifted in one go. A drawing that arrives with 118 of
   its 130 layers locked is read-only in practice, and unlocking it row by row
   is the kind of chore that makes people give up on the tool. */
document.getElementById('layAllUnlock').addEventListener('click', ()=>{
  let n=0; for (const l of layers) if (l.locked){ l.locked=false; n++; }
  log(n ? `Unlocked ${n} layer${n>1?'s':''} — everything on them can be selected now.`
        : 'No layer is locked.', 'r');
  refreshLayers(); draw();
});
document.getElementById('layIsolate').addEventListener('click', ()=>{
  let n=0; for (const l of layers) if (l.name!==currentLayer && !l.off){ l.off=true; n++; }
  for (const e of entities) if (e.layer!==currentLayer) selection.delete(e.id);
  log(`Isolated "${currentLayer}" — hid ${n} other layer${n===1?'':'s'}. "Show all" brings them back.`, 'r');
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
  (/\.dwg$/i.test(f.name) ? openDWG : /\.dxf$/i.test(f.name) ? openDXF : openJSON)(f);
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
  focusCmd();
  draw();
}
boot();
setInterval(autosaveTick, 5000);                         // quiet safety net
window.addEventListener('beforeunload', autosaveTick);
