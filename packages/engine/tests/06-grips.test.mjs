function makeCtx(){ return new Proxy({}, { get(t,p){ if (p in t) return t[p]; return ()=>{}; }, set(t,p,v){ t[p]=v; return true; } }); }
function makeEl(){ const el={ style:{},dataset:{},children:[],value:'',textContent:'',innerHTML:'',listeners:{},classList:{toggle(){},add(){},remove(){}},addEventListener(t,f){(el.listeners[t] ||= []).push(f);},appendChild(c){el.children.push(c);return c;},removeChild(){},get firstChild(){return el.children[0];},scrollTop:0,scrollHeight:0,focus(){},click(){},getBoundingClientRect(){return{width:800,height:600,left:0,top:0};},getContext(){return makeCtx();} }; return el; }
const els=new Map();
globalThis.document={getElementById(id){if(!els.has(id))els.set(id,makeEl());return els.get(id);},createElement(){return makeEl();},querySelectorAll(){return[];},activeElement:null};
const winL={};
globalThis.window={devicePixelRatio:1,addEventListener(t,f){(winL[t] ||= []).push(f);}};
await import('../js/adapters/dom/main.js');
const S=await import('../js/core/state.js'); const C=await import('../js/core/commands.js');
const E=await import('../js/core/entities.js'); const V=await import('../js/adapters/dom/view.js');
const cv=document.getElementById('cv');
const fire=(t,ev)=>cv.listeners[t]?.forEach(f=>f({preventDefault(){},...ev}));
const fireWin=(t,ev)=>winL[t]?.forEach(f=>f({preventDefault(){},key:'',...ev}));
let fails=0; const check=(n,c)=>{console.log((c?'PASS':'FAIL')+'  '+n); if(!c)fails++;};
const near=(a,b,e=1e-6)=>Math.abs(a-b)<e;
S.T.osnap=false; S.T.ortho=false;
const add=(x1,y1,x2,y2)=>{C.startCommand('L');C.handleEnter(`${x1},${y1}`);C.handleEnter(`${x2},${y2}`);C.handleEnter('');return S.entities[S.entities.length-1];};
const sp=(x,y)=>V.w2s({x,y});
function drag(fromW, toW){
  const a=sp(fromW.x,fromW.y), b=sp(toW.x,toW.y);
  fire('mousemove',{clientX:a.x,clientY:a.y});
  fire('mousedown',{button:0,clientX:a.x,clientY:a.y});
  fire('mousemove',{clientX:(a.x+b.x)/2,clientY:(a.y+b.y)/2});
  fire('mousemove',{clientX:b.x,clientY:b.y});
  fireWin('mouseup',{button:0});
}

// grips: stretch a line endpoint
const l1=add(0,0,100,0);
S.selection.add(l1.id);
const u0=S.undoStack.length;
drag({x:100,y:0},{x:100,y:50});            // grab p2 grip, drag up
check('endpoint grip stretched line', near(l1.x2,100)&&near(l1.y2,50)&&near(l1.x1,0)&&near(l1.y1,0));
check('one undo step', S.undoStack.length===u0+1);
C.doUndo();
check('undo restores', near(S.entities[0].y2,0));

// mid grip moves whole line
const l1b=S.entities[0]; S.selection.add(l1b.id);
drag({x:50,y:0},{x:50,y:30});
check('mid grip moved whole line', near(l1b.y1,30)&&near(l1b.y2,30)&&near(l1b.x1,0)&&near(l1b.x2,100));
C.doUndo();

// osnap during grip drag: endpoint snaps onto another line's endpoint
S.T.osnap=true;
const l2=S.entities[0];
const l3=add(200,1,300,1);                 // its start (200,1) is a snap target
S.selection.clear(); S.selection.add(l2.id);
drag({x:100,y:0},{x:199,y:2});             // drop near (200,1) → should snap exactly
check('grip drag snapped to other endpoint', near(l2.x2,200)&&near(l2.y2,1));
S.T.osnap=false;
C.doUndo();

// circle quadrant grip resizes
S.setEntities([]); S.selection.clear(); S.undoStack.length=0;
C.startCommand('C'); C.handleEnter('0,0'); C.handleEnter('50');
const cir=S.entities[0]; S.selection.add(cir.id);
drag({x:50,y:0},{x:80,y:0});               // quadrant grip outward
check('quadrant grip resized circle', near(cir.r,80)&&near(cir.cx,0));
drag({x:0,y:0},{x:20,y:20});               // center grip moves
check('center grip moved circle', near(cir.cx,20)&&near(cir.cy,20)&&near(cir.r,80));

// pline vertex grip
S.setEntities([]); S.selection.clear();
C.startCommand('REC'); C.handleEnter('0,0'); C.handleEnter('40,30');
const rect=S.entities[0]; S.selection.add(rect.id);
drag({x:40,y:30},{x:60,y:45});             // move a corner vertex
check('pline vertex grip moved', rect.pts.some(p=>near(p.x,60)&&near(p.y,45)));

// arc endpoint grip changes angle
S.setEntities([]); S.selection.clear();
S.entities.push({id:S.nextId(), type:'arc', cx:0, cy:0, r:50, a0:0, a1:Math.PI/2, layer:'0'});
const arc=S.entities[0]; S.selection.add(arc.id);
drag({x:0,y:50},{x:-50,y:0});              // drag a1 end from 90° to 180°
check('arc endpoint grip changed a1', near(arc.a1, Math.PI, 1e-6)&&near(arc.a0,0));

// Esc mid grip-drag reverts
S.setEntities([]); S.selection.clear(); S.undoStack.length=0;
const l4=add(0,0,100,0); S.selection.add(l4.id);
const uEsc=S.undoStack.length;
const a=sp(100,0), b=sp(100,60);
fire('mousemove',{clientX:a.x,clientY:a.y});
fire('mousedown',{button:0,clientX:a.x,clientY:a.y});
fire('mousemove',{clientX:b.x,clientY:b.y});
check('mid-drag grip moved', near(l4.y2,60));
fireWin('keydown',{key:'Escape'});
check('Esc reverts grip edit', near(S.entities[0].y2,0) && S.undoStack.length===uEsc);
fireWin('mouseup',{button:0});

// grips inert while a command runs
const l5=S.entities[0]; S.selection.add(l5.id);
C.startCommand('L');
const g=sp(100,0);
fire('mousemove',{clientX:g.x,clientY:g.y});
fire('mousedown',{button:0,clientX:g.x,clientY:g.y});   // should be a LINE point, not a grip
check('during command, grip press feeds the command', S.cmd && S.cmd.base!==null);
C.cancelCmd();
check('line untouched', near(S.entities[0].x2,100)&&near(S.entities[0].y2,0));

console.log(fails?`\n${fails} FAILURES`:'\nALL PASS');
process.exit(fails?1:0);
