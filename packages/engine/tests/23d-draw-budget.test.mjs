/* What a frame is allowed to cost.
   Opening a 17,000-entity import and zooming froze the board for a second or
   two, twice, then went fast once zoomed in. Nothing in our own JS was slow —
   a full draw() measures ~10 ms headless — so the cost was in real
   rasterisation, of which there were two sources: one draw per wheel event
   (a trackpad outruns a 17k-entity frame, and the frames queue behind the
   input), and ~1000 text labels rendered two pixels tall at zoom-to-extents,
   illegible and repaid every frame. This suite locks both.
   ADAPTER-INTEGRATION suite. */
import { setupDOM, check, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const V = await import('../js/adapters/dom/view.js');

/* count what actually reaches the canvas */
let clears = 0, texts = [];
V.ctx.clearRect = () => { clears++; };
V.ctx.fillText = (str) => { texts.push(String(str)); };
V.ctx.measureText = () => ({ width: 10 });
const reset = () => { clears = 0; texts = []; };

/* ===== 1. no requestAnimationFrame (this harness): draw straight away ===== */
check('without rAF, draw() is synchronous so suites still see it',
      (()=>{ reset(); V.draw(); return clears === 1; })());

/* ===== 2. with rAF: many calls, one frame ===== */
let queued = [];
globalThis.requestAnimationFrame = fn => { queued.push(fn); return queued.length; };

reset();
for (let i = 0; i < 50; i++) V.draw();
check('50 draw() calls in one tick schedule exactly one frame', queued.length === 1);
check('…and nothing is rasterised until the frame runs', clears === 0);

queued.shift()();
check('the frame draws once', clears === 1);

reset();
V.draw();
check('after the frame, the next draw() schedules again', queued.length === 1);
queued.shift()();
check('…and draws', clears === 1);

// drawNow stays available for anything that cannot wait for a frame
reset();
V.drawNow();
check('drawNow() bypasses the queue', clears === 1 && queued.length === 0);

delete globalThis.requestAnimationFrame;

/* ===== 3. text too small to read is not rendered ===== */
S.setEntities([{ id: 1, type: 'text', layer: '0', x: 0, y: 0, h: 2.5, str: 'SUÍTE HÓSPEDES' }]);
S.view.ox = 400; S.view.oy = 300;

S.view.scale = 1.19;                       // zoom-to-extents on a 600-unit site
reset(); V.drawNow();
check('a 3 px label is skipped at zoom-to-extents',
      !texts.includes('SUÍTE HÓSPEDES'));

S.view.scale = 4;                          // 10 px tall — readable
reset(); V.drawNow();
check('…and drawn once it can be read', texts.includes('SUÍTE HÓSPEDES'));

// a selected object must always show itself, however far out you are
S.view.scale = 1.19;
S.selection.add(1);
reset(); V.drawNow();
check('a selected label draws at any zoom — you asked for it',
      texts.includes('SUÍTE HÓSPEDES'));
S.selection.clear();

/* The dimension VALUE follows the same rule; its ticks and lines do not.
   137 so the string cannot be confused with a ruler label — the rulers draw
   through the same fillText, which is what made the first version of this
   check pass on the wrong evidence. */
S.setEntities([{ id: 2, type: 'dim', layer: '0', x1: 0, y1: 0, x2: 137, y2: 0, off: 2 }]);
const value = t => t.some(s => s.includes('137'));

S.view.scale = 0.2;                        // value would be ~1 px tall
reset(); V.drawNow();
check('a dimension value is skipped when it would not read', !value(texts));

S.view.scale = 20;
reset(); V.drawNow();
check('…and is drawn when it would', value(texts));

finish();
