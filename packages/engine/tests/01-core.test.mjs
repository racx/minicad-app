/* Smoke test: stub the DOM, import main.js (runs boot), then drive the command engine. */
const logLines = [];

function makeCtx(){
  return new Proxy({}, {
    get(t,p){ if (p in t) return t[p]; return (..._a)=>{}; },
    set(t,p,v){ t[p]=v; return true; }
  });
}
function makeEl(tag){
  const el = {
    tag, style:{}, dataset:{}, children:[], value:'', textContent:'', innerHTML:'',
    classList:{ toggle(){}, add(){}, remove(){} },
    addEventListener(){}, removeEventListener(){},
    appendChild(c){ el.children.push(c); return c; },
    removeChild(c){ const i=el.children.indexOf(c); if(i>=0) el.children.splice(i,1); },
    get firstChild(){ return el.children[0]; },
    scrollTop:0, scrollHeight:0,
    focus(){}, click(){},
    getBoundingClientRect(){ return {width:800, height:600, left:0, top:0}; },
    getContext(){ return makeCtx(); },
  };
  return el;
}
const els = new Map();
globalThis.document = {
  getElementById(id){ if(!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
  createElement(tag){ return makeEl(tag); },
  querySelectorAll(){ return []; },
  activeElement: null,
};
globalThis.window = { devicePixelRatio:1, addEventListener(){}, removeEventListener(){} };
globalThis.prompt = ()=>null;

// capture history log lines
const historyEl = document.getElementById('history');
historyEl.appendChild = d => { logLines.push(d.textContent); };

await import('../js/main.js');

const S = await import('../js/state.js');
const C = await import('../js/commands.js');
const E = await import('../js/entities.js');
const IO = await import('../js/io.js');

let fails = 0;
const check = (name, cond) => { console.log((cond?'PASS':'FAIL')+'  '+name); if(!cond) fails++; };

// --- boot ---
check('boot logged ready message', logLines.some(l=>l.includes('MiniCAD ready')));

// --- LINE via typed coordinates ---
C.startCommand('L');
C.handleEnter('0,0');
C.handleEnter('100,0');
C.handleEnter('');                 // end LINE
check('LINE created one entity', S.entities.length===1 && S.entities[0].type==='line');
check('LINE coords correct', S.entities[0].x2===100 && S.entities[0].y2===0);
check('cmd ended', S.cmd===null);

// --- relative + polar input ---
C.startCommand('LINE');
C.handleEnter('10,10');
C.handleEnter('@0,50');
C.handleEnter('@50<0');
C.handleEnter('');
check('relative/polar made 2 more lines', S.entities.length===3);
const l3 = S.entities[2];
check('polar endpoint correct', Math.abs(l3.x2-60)<1e-9 && Math.abs(l3.y2-60)<1e-9);

// --- CIRCLE typed radius ---
C.startCommand('C');
C.handleEnter('0,0');
C.handleEnter('25');
check('CIRCLE created', S.entities.some(e=>e.type==='circle' && e.r===25));

// --- RECTANG ---
C.startCommand('REC');
C.handleEnter('0,0');
C.handleEnter('40,30');
const rect = S.entities.find(e=>e.type==='pline' && e.closed);
check('RECTANG created closed pline with 4 pts', !!rect && rect.pts.length===4);

// --- TEXT ---
C.startCommand('T');
C.handleEnter('5,5');       // insertion point
C.handleEnter('');          // default height 2.5
C.handleEnter('hello world');
check('TEXT created', S.entities.some(e=>e.type==='text' && e.str==='hello world' && e.h===2.5));

// --- hit-test / bbox ---
const hit = E.findEntityAt({x:50, y:0.5});
check('findEntityAt finds first line', !!hit && hit.type==='line');
check('entBBox line', JSON.stringify(E.entBBox(S.entities[0]))==='[0,0,100,0]');

// --- undo / redo ---
const before = S.entities.length;
C.doUndo();
check('undo removed text', S.entities.length===before-1);
C.doRedo();
check('redo restored', S.entities.length===before);

// --- ERASE via selection ---
S.selection.add(S.entities[0].id);
C.startCommand('E');
check('erase consumed selection', S.entities.length===before-1 && S.cmd===null);
C.doUndo();
check('undo restored erased', S.entities.length===before);

// --- repeat last command on empty Enter ---
C.handleEnter('');
check('empty Enter repeats last command', S.cmd!==null && S.cmd.name==='ERASE');
C.cancelCmd();

// --- DXF export content ---
let dxfData = null;
IO && (await import('../js/io.js'));
// intercept download via URL/Blob stubs
globalThis.Blob = class { constructor(parts){ this.data = parts.join(''); } };
globalThis.URL = { createObjectURL(b){ dxfData = b.data; return 'blob:x'; }, revokeObjectURL(){} };
IO.dxfExport();
check('DXF has header/entities/EOF', !!dxfData && dxfData.includes('$ACADVER') && dxfData.includes('ENTITIES') && dxfData.trim().endsWith('EOF'));
check('DXF has LINE + CIRCLE + POLYLINE + TEXT', ['LINE','CIRCLE','POLYLINE','TEXT'].every(k=>dxfData.includes('\n'+k+'\n')||dxfData.includes(k)));

// --- osnap ---
S.T.osnap = true;
const snapped = C.applyModifiers({x:99.5, y:0.3});   // near endpoint (100,0)
check('osnap snapped to endpoint', snapped.x===100 && snapped.y===0 && S.snapMark && S.snapMark.k==='end');

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails?1:0);
