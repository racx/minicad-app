function makeCtx(){ return new Proxy({}, { get(t,p){ if (p in t) return t[p]; return ()=>{}; }, set(t,p,v){ t[p]=v; return true; } }); }
function makeEl(){ const el={ style:{},dataset:{},children:[],value:'',textContent:'',innerHTML:'',classList:{toggle(){},add(){},remove(){}},addEventListener(){},appendChild(c){el.children.push(c);return c;},removeChild(){},get firstChild(){return el.children[0];},scrollTop:0,scrollHeight:0,focus(){},click(){},getBoundingClientRect(){return{width:800,height:600,left:0,top:0};},getContext(){return makeCtx();} }; return el; }
const els=new Map();
globalThis.document={getElementById(id){if(!els.has(id))els.set(id,makeEl());return els.get(id);},createElement(){return makeEl();},querySelectorAll(){return[];},activeElement:null};
globalThis.window={devicePixelRatio:1,addEventListener(){}};
const logs=[]; document.getElementById('history').appendChild=d=>logs.push(d.textContent);
await import('../js/adapters/dom/main.js');
const S=await import('../js/core/state.js'); const C=await import('../js/core/commands.js');
let fails=0; const check=(n,c)=>{console.log((c?'PASS':'FAIL')+'  '+n); if(!c)fails++;};
S.T.osnap=false; S.T.ortho=false;
const add=(x1,y1,x2,y2)=>{C.startCommand('L');C.handleEnter(`${x1},${y1}`);C.handleEnter(`${x2},${y2}`);C.handleEnter('');return S.entities[S.entities.length-1];};
// the exact trap: both lines pre-selected, then TR ↵ ↵
const h=add(0,0,100,0), v=add(50,-50,50,50);
S.selection.add(h.id); S.selection.add(v.id);
C.startCommand('TR');
check('preselection cleared on TRIM start', S.selection.size===0 && S.cmd.sel.length===0);
C.handleEnter('');
check('first Enter = all-edges mode (not "2 edges")', S.cmd && S.cmd.step==='trim' && S.cmd.allEdges===true);
C.onPoint({x:80,y:0});   // click right leg — should trim it
check('right leg trimmed', S.entities.filter(e=>e.y1===0&&e.y2===0).every(e=>e.x2<=50.001));
S.selection.add(h.id);   // simulate an edge staying highlighted
C.handleEnter('');       // end TRIM
check('selection cleared when TRIM ends', S.cmd===null && S.selection.size===0);
// EXTEND same policy
S.selection.add(v.id);
C.startCommand('EX');
check('preselection cleared on EXTEND start', S.selection.size===0);
C.cancelCmd();
console.log(fails?`\n${fails} FAILURES`:'\nALL PASS');
process.exit(fails?1:0);
