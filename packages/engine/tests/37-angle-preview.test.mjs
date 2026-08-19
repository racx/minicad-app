/* Angle preview at the cursor: dashed East-to-rubber arc with the angle boxed
   at it, and the length boxed on the rubber line (AutoCAD dynamic input). */
import { setupDOM, check, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const V = await import('../js/adapters/dom/view.js');

const texts = [];
V.ctx.fillText = t => texts.push(String(t));
const painted = t => texts.some(x => x === t);
const paintedLike = re => texts.some(x => re.test(x));

/* ===== drawing a 45° rubber band shows 45° and the live length ===== */
S.mouse.inside = true;
C.startCommand('L');
C.handleEnter('0,0');
S.setCurPt({x:100, y:100});
texts.length = 0;
V.drawNow();
check('angle label painted', painted('45°'));
const lenLabel = `${S.unitFmt(Math.hypot(100,100))} ${S.units}`;
check('length label rides the line', painted(lenLabel));

/* ===== angle measured CCW from East, wrapped 0–360 ===== */
S.setCurPt({x:0, y:-80});                        // straight down = 270°
texts.length = 0;
V.drawNow();
check('downward = 270°', painted('270°'));
check('no stale 45° label', !painted('45°'));

/* ===== due East: no arc to show, length still there ===== */
S.setCurPt({x:120, y:0});
texts.length = 0;
V.drawNow();
check('0° draws no angle label', !paintedLike(/^\d+°$/));
check('…but the length still shows', painted(`${S.unitFmt(120)} ${S.units}`));

/* ===== gates: idle and F12-off stay clean ===== */
C.cancelCmd(true);
texts.length = 0;
V.drawNow();
check('idle: no angle/length labels', !paintedLike(/°$/) && !painted(lenLabel));

C.startCommand('L');
C.handleEnter('0,0');
S.setCurPt({x:100, y:100});
S.T.dyn = false;
texts.length = 0;
V.drawNow();
check('DYN off (F12): no labels', !painted('45°'));
S.T.dyn = true;
C.cancelCmd(true);

finish();
