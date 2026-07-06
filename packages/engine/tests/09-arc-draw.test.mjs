/* ARC command: 3-point arc drawing. */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/main.js');
const S = await import('../js/state.js');
const C = await import('../js/commands.js');
const G = await import('../js/geometry.js');

S.T.osnap=false; S.T.ortho=false;

// arcFrom3 math: (50,0)→through (0,50)→(-50,0) = top half of r=50 circle, CCW start at 0°
let a = G.arcFrom3({x:50,y:0}, {x:0,y:50}, {x:-50,y:0});
check('circumcircle center/radius', near(a.cx,0)&&near(a.cy,0)&&near(a.r,50));
check('direction from middle point (CCW)', near(a.a0,0) && near(a.a1,Math.PI));
// same ends, middle point below → the other way round
a = G.arcFrom3({x:50,y:0}, {x:0,y:-50}, {x:-50,y:0});
check('middle below flips direction', near(G.normAng(a.a0),Math.PI) && near(a.a1,G.TAU===undefined?0:0, 1e-6) || (near(a.a0,Math.PI)&&near(a.a1,0)));
check('collinear returns null', G.arcFrom3({x:0,y:0},{x:1,y:0},{x:2,y:0})===null);

// full command flow
C.startCommand('A');
check('prompts start point', dom.promptEl.textContent.includes('start point'));
C.handleEnter('50,0');
check('prompts second point', dom.promptEl.textContent.includes('second point'));
C.handleEnter('0,50');
C.handleEnter('-50,0');
const arc = S.entities[0];
check('arc entity created', !!arc && arc.type==='arc' && near(arc.r,50) && near(arc.cx,0));
check('command ended', S.cmd===null);
check('one undo step', S.undoStack.length===1);
C.doUndo();
check('undo removes arc', S.entities.length===0);

// collinear third point refused, command stays alive for a re-pick
C.startCommand('ARC');
C.handleEnter('0,0'); C.handleEnter('10,0'); C.handleEnter('20,0');
check('collinear refused with message', dom.logs.some(l=>l.includes('straight line')) && S.entities.length===0);
check('command still waiting for a better end point', S.cmd!==null && S.cmd.pts.length===2);
C.handleEnter('10,10');
check('re-picked end point completes the arc', S.entities.length===1 && S.entities[0].type==='arc');

finish();
