/* Meet-the-edge intersection suggestion + alignment tracking guides. */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');

S.T.osnap=true; S.T.ortho=false;
const add=(x1,y1,x2,y2)=>{C.startCommand('L');C.handleEnter(`${x1},${y1}`);C.handleEnter(`${x2},${y2}`);C.handleEnter('');return S.entities[S.entities.length-1];};
const reset=()=>{S.setEntities([]);S.undoStack.length=0;S.selection.clear();};

/* ===== meet-the-edge: rubber line crossing an edge suggests the exact crossing ===== */
reset();
add(50,0,50,100);                              // a wall at x=50
C.startCommand('L'); C.handleEnter('0,50');    // drawing from (0,50) toward the wall
let p = C.applyModifiers({x:49, y:80});        // just before the wall, far from the perp foot (50,50)
check('about-to-cross suggests the wall crossing', S.snapMark && S.snapMark.k==='xint' && near(p.x,50));
p = C.applyModifiers({x:51.5, y:80.2});        // cursor just past the wall
check('just-crossed snaps back onto the wall', S.snapMark && S.snapMark.k==='xint' && near(p.x,50));
p = C.applyModifiers({x:49, y:51});            // near (50,50): wall midpoint AND perp foot
check('smarter snaps outrank the crossing suggestion',
      S.snapMark && ['mid','perp'].includes(S.snapMark.k) && near(p.x,50) && near(p.y,50));
C.cancelCmd();

/* ===== alignment tracking: h/v guides from existing points ===== */
reset();
add(100,0,200,0);                              // endpoints at (100,0) and (200,0)
C.startCommand('L');
p = C.applyModifiers({x:99.4, y:40});          // cursor 40 above, x within tol of 100
check('x-aligned: snaps to the corner x', S.snapMark && S.snapMark.k==='trk' && near(p.x,100) && near(p.y,40));
check('one guide from the aligned point', S.trackGuides && S.trackGuides.length===1 &&
      near(S.trackGuides[0].from.x,100) && near(S.trackGuides[0].from.y,0));

/* both axes engage → projected corner */
add(0,60,10,60);                               // gives a y=60 endpoint far to the left
C.startCommand('L');
p = C.applyModifiers({x:99.4, y:59.5});
check('two-axis tracking lands on the projected corner', near(p.x,100) && near(p.y,60) &&
      S.trackGuides && S.trackGuides.length===2);

/* direct snap always beats tracking */
p = C.applyModifiers({x:99.5, y:0.5});
check('END outranks tracking', S.snapMark && S.snapMark.k==='end' && near(p.x,100) && near(p.y,0));
C.cancelCmd();

/* tracking is drawing-time only: idle hover gives no guides */
p = C.applyModifiers({x:99.4, y:40});
check('no tracking when idle', S.snapMark===null && S.trackGuides===null && near(p.x,99.4));

/* osnap off kills all of it */
S.T.osnap=false;
C.startCommand('L');
p = C.applyModifiers({x:99.4, y:40});
check('F3 off: raw cursor', S.snapMark===null && near(p.x,99.4));
C.cancelCmd();
S.T.osnap=true;

finish();
