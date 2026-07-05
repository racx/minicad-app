/* Layer visibility/lock, CHLAYER, double-click text editing. */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/main.js');
const S = await import('../js/state.js');
const C = await import('../js/commands.js');
const E = await import('../js/entities.js');
const V = await import('../js/view.js');

S.T.osnap=false; S.T.ortho=false;
const add=(x1,y1,x2,y2)=>{C.startCommand('L');C.handleEnter(`${x1},${y1}`);C.handleEnter(`${x2},${y2}`);C.handleEnter('');return S.entities[S.entities.length-1];};

// --- visibility: hidden layers can't be picked, snapped, or box-selected ---
const l0 = add(0,0,100,0);                       // layer '0'
S.setCurrentLayer('walls');
const lw = add(0,20,100,20);                     // layer 'walls'
S.layerOf('walls').off = true;
check('hidden: findEntityAt ignores it', E.findEntityAt({x:50,y:20})===null);
check('hidden: not in snap candidates', !E.snapCandidates().some(c=>c.p.y===20));
S.T.osnap=true;
const p = C.applyModifiers({x:99.5,y:20.5});     // right next to the hidden line's endpoint
check('hidden: no snap onto hidden geometry', near(p.x,99.5) && near(p.y,20.5) && S.snapMark===null);
S.T.osnap=false;
S.selection.clear();
C.boxSelect({x0:V.w2s({x:120,y:-10}).x, y0:V.w2s({x:120,y:-10}).y,
             x1:V.w2s({x:-10,y:30}).x,  y1:V.w2s({x:-10,y:30}).y}, true);
check('hidden: box select skips it', S.selection.has(l0.id) && !S.selection.has(lw.id));
S.layerOf('walls').off = false;

// --- lock: visible + snappable, but unpickable ---
S.layerOf('walls').locked = true;
check('locked: findEntityAt ignores it', E.findEntityAt({x:50,y:20})===null);
check('locked: still snappable', E.snapCandidates().some(c=>c.p.y===20));
S.selection.clear();
C.boxSelect({x0:V.w2s({x:120,y:-10}).x, y0:V.w2s({x:120,y:-10}).y,
             x1:V.w2s({x:-10,y:30}).x,  y1:V.w2s({x:-10,y:30}).y}, true);
check('locked: box select skips it', !S.selection.has(lw.id));
S.layerOf('walls').locked = false;

// --- TRIM all-edges ignores hidden layers ---
S.setEntities([]); S.selection.clear(); S.setCurrentLayer('0');
const tgt = add(0,0,100,0);
S.setCurrentLayer('walls');
add(50,-10,50,10);                                // would-be cutting edge on 'walls'
S.layerOf('walls').off = true;
C.startCommand('TR'); C.handleEnter('');
C.onPoint({x:80,y:0});
check('hidden edge cannot cut', dom.logs.some(l=>l.includes('does not intersect')) && near(tgt.x2,100));
C.handleEnter('');
S.layerOf('walls').off = false;
S.setCurrentLayer('0');

// --- CHLAYER ---
S.setEntities([]); S.selection.clear();
const cl = add(0,0,50,0);
S.selection.add(cl.id);
C.startCommand('CH');
check('CHLAYER prompts with default', dom.promptEl.textContent.includes(`<0>`));
C.handleEnter('nope');
check('unknown layer rejected, lists layers', dom.logs.some(l=>l.includes('No layer "nope"')) && S.cmd!==null);
C.handleEnter('walls');
check('moved to walls', cl.layer==='walls' && S.cmd===null);
C.doUndo();
check('CHLAYER undoes', S.entities[0].layer==='0');
S.selection.clear();
C.startCommand('CHLAYER');
check('CHLAYER without selection refuses', dom.logs.some(l=>l.includes('Select objects first')) && S.cmd===null);

// --- double-click text editing ---
S.setEntities([]); S.selection.clear();
C.startCommand('T'); C.handleEnter('10,10'); C.handleEnter('5'); C.handleEnter('hello wrold');
const txt = S.entities[0];
const sp = V.w2s({x:12,y:11});                    // inside the text box
dom.fire('mousemove', {clientX:sp.x, clientY:sp.y});
dom.fire('dblclick',  {clientX:sp.x, clientY:sp.y});
check('dblclick enters edit mode with prefilled input', S.cmd && S.cmd.name==='EDITTEXT' && dom.els.get('cmdInput').value==='hello wrold');
C.handleEnter('hello world');
check('text updated', txt.str==='hello world' && S.cmd===null);
C.doUndo();
check('text edit undoes', S.entities[0].str==='hello wrold');

finish();
