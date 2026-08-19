/* Compass rose: N/E/S/W ring with the TOP badge, top-right of the board. */
import { setupDOM, check, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const V = await import('../js/adapters/dom/view.js');

const texts = [];
V.ctx.fillText = (t, x, y) => texts.push({t, x, y});

V.drawNow();
const at = t => texts.filter(c=>c.t===t);
check('all four cardinal letters painted', ['N','E','S','W'].every(t=>at(t).length===1));
check('TOP badge painted', at('TOP').length===1);

const n=at('N')[0], s=at('S')[0], e=at('E')[0], w=at('W')[0], top=at('TOP')[0];
check('north above south, west left of east', n.y < s.y && w.x < e.x);
check('rose is centered on the TOP badge',
      Math.abs((n.x+s.x)/2 - top.x) < 1 && Math.abs((e.y+w.y)/2 - top.y) < 1);
check('rose sits top-right of the canvas', top.x > V.W*0.8 && top.y < V.H*0.3);

finish();
