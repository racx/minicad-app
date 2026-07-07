/* =========================================================
   MiniCAD core — viewport math (pure functions over state.view)
   Screen↔world transforms and the adaptive grid step. No DOM:
   canvas sizing/rendering stay in the view adapter.
   ========================================================= */
import { view } from '../state.js';

export function w2s(p){ return { x: p.x*view.scale + view.ox, y: -p.y*view.scale + view.oy }; }
export function s2w(x, y){ return { x: (x - view.ox)/view.scale, y: (view.oy - y)/view.scale }; }

export function gridStep(){
  const target = 28/view.scale;                 // want ≥28 px between lines
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1,2,5,10]) if (m*pow >= target) return m*pow;
  return 10*pow;
}
