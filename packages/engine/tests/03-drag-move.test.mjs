/* Smoke test: drag-to-move a selected entity, via the real event handlers. */
function makeCtx(){ return new Proxy({}, { get(t,p){ if (p in t) return t[p]; return ()=>{}; }, set(t,p,v){ t[p]=v; return true; } }); }
function makeEl(){
  const el = { style:{}, dataset:{}, children:[], value:'', textContent:'', innerHTML:'', listeners:{},
    classList:{ toggle(){}, add(){}, remove(){} },
    addEventListener(type,fn){ (el.listeners[type] ||= []).push(fn); },
    appendChild(c){ el.children.push(c); return c; }, removeChild(){},
    get firstChild(){ return el.children[0]; }, scrollTop:0, scrollHeight:0,
    focus(){}, click(){}, getBoundingClientRect(){ return {width:800,height:600,left:0,top:0}; },
    getContext(){ return makeCtx(); } };
  return el;
}
const els = new Map();
globalThis.document = { getElementById(id){ if(!els.has(id)) els.set(id, makeEl()); return els.get(id); },
  createElement(){ return makeEl(); }, querySelectorAll(){ return []; }, activeElement:null };
const winListeners = {};
globalThis.window = { devicePixelRatio:1, addEventListener(type,fn){ (winListeners[type] ||= []).push(fn); } };

await import('../js/main.js');
const S = await import('../js/state.js');
const C = await import('../js/commands.js');
const V = await import('../js/view.js');

const cv = document.getElementById('cv');
const fire = (target, type, ev) => (target.listeners||winListeners)[type]?.forEach(fn=>fn({preventDefault(){}, ...ev}));
const fireWin = (type, ev) => winListeners[type]?.forEach(fn=>fn({preventDefault(){}, key:'', ...ev}));

let fails = 0;
const check = (n,c)=>{ console.log((c?'PASS':'FAIL')+'  '+n); if(!c) fails++; };
const near = (a,b,eps=1e-6)=>Math.abs(a-b)<eps;

S.T.osnap=false; S.T.ortho=false;

// draw a line from (0,0) to (100,0)
C.startCommand('L'); C.handleEnter('0,0'); C.handleEnter('100,0'); C.handleEnter('');
const line = S.entities[0];

// screen coords of world midpoint (50,0)
const mid = V.w2s({x:25,y:0});   // body point, not a grip

// 1. click on unselected line → selects it (mousedown starts boxSel, mouseup click-selects)
fire(cv,'mousemove',{clientX:mid.x, clientY:mid.y});
fire(cv,'mousedown',{button:0, clientX:mid.x, clientY:mid.y});
fireWin('mouseup',{button:0});
check('click selects line', S.selection.has(line.id));

// 2. drag the selected line 25 world units right (100px at scale 4)
const undoDepth = S.undoStack.length;
fire(cv,'mousedown',{button:0, clientX:mid.x, clientY:mid.y});
fire(cv,'mousemove',{clientX:mid.x+50,  clientY:mid.y});
fire(cv,'mousemove',{clientX:mid.x+100, clientY:mid.y});
fireWin('mouseup',{button:0});
check('drag moved line +25', near(line.x1,25) && near(line.x2,125) && near(line.y1,0));
check('still selected after drag', S.selection.has(line.id));
check('drag = one undo step', S.undoStack.length===undoDepth+1);
C.doUndo();
check('undo restores position', near(S.entities[0].x1,0) && near(S.entities[0].x2,100));

// re-select (undo cleared selection)
const line2 = S.entities[0];
S.selection.add(line2.id);

// 3. plain click (no movement) on selected line → toggles it OFF, no undo entry
const undoDepth2 = S.undoStack.length;
fire(cv,'mousemove',{clientX:mid.x, clientY:mid.y});
fire(cv,'mousedown',{button:0, clientX:mid.x, clientY:mid.y});
fireWin('mouseup',{button:0});
check('plain click toggles selection off', !S.selection.has(line2.id));
check('no undo entry for plain click', S.undoStack.length===undoDepth2);

// 4. Esc mid-drag aborts and restores
S.selection.add(line2.id);
fire(cv,'mousedown',{button:0, clientX:mid.x, clientY:mid.y});
fire(cv,'mousemove',{clientX:mid.x+80, clientY:mid.y});
check('mid-drag entity moved', near(line2.x1,20));
fireWin('keydown',{key:'Escape'});
check('Esc aborts drag, position restored', near(S.entities[0].x1,0) && near(S.entities[0].x2,100));
fireWin('mouseup',{button:0});  // release after abort — should be a no-op
check('mouseup after abort is harmless', near(S.entities[0].x1,0));

// 5. drag on empty space still box-selects (not a move)
S.selection.clear();
const far = V.w2s({x:200,y:200});
fire(cv,'mousedown',{button:0, clientX:far.x, clientY:far.y});
fire(cv,'mousemove',{clientX:far.x+30, clientY:far.y+30});
check('empty-space drag starts box selection', S.boxSel!==null);
fireWin('mouseup',{button:0});
check('box in empty space selects nothing', S.selection.size===0);

// 6. dragging is disabled while a command runs (select step boxes instead)
S.selection.add(line2.id);
C.startCommand('M');            // MOVE with preselection goes to base step; cancel and use ERASE-style select
C.cancelCmd();
S.selection.clear();
C.startCommand('M');            // no selection → select step
fire(cv,'mousedown',{button:0, clientX:mid.x, clientY:mid.y});
check('during select step, press starts box (no drag)', S.boxSel!==null);
fireWin('mouseup',{button:0});
C.cancelCmd();
check('line untouched by in-command press', near(S.entities[0].x1,0));

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails?1:0);
