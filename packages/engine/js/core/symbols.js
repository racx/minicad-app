/* =========================================================
   MiniCAD — the symbol library (pure data)

   Doors, windows, sanitary ware and furniture, so a plan can be furnished
   without drawing the same chair forty times. These are ordinary block
   definitions; INSERT copies one into the drawing the first time it is used,
   after which it is the drawing's own and can be exploded, edited or exported
   like any other block.

   EVERYTHING HERE IS IN METRES. A door is 0.8 wide because that is what a door
   is; the drawing might be in millimetres, so `symbolDef` scales on the way in.
   Defining them in whatever unit the file happens to use is how you end up
   inserting a door eighty metres wide.

   Each symbol's BASE POINT is the handle you place it by, and it is chosen to
   be the point you would actually aim at: the hinge of a door, the wall face of
   a window, the back centre of a WC. Geometry carries no layer, which means it
   inherits the layer of the insert (see blockParts).
   ========================================================= */

let seq = 0;
const id = () => ++seq;

const L  = (x1, y1, x2, y2) => ({id:id(), type:'line', x1, y1, x2, y2});
const C  = (cx, cy, r)      => ({id:id(), type:'circle', cx, cy, r});
const A  = (cx, cy, r, a0, a1) => ({id:id(), type:'arc', cx, cy, r, a0, a1});
const R  = (x, y, w, h) => ({id:id(), type:'pline', closed:true,
  pts:[{x, y}, {x:x+w, y}, {x:x+w, y:y+h}, {x, y:y+h}]});

const HALF = Math.PI/2;

/* A door: hinge at the origin, drawn open at 90° with its swing.
   The leaf lies along +Y and the opening runs along +X, so inserting it at a
   hinge with the wall running +X needs no rotation. */
const door = w => ({
  label: `Door ${Math.round(w*1000)}`, group: 'Openings',
  base: {x:0, y:0},
  ents: [ L(0, 0, 0, w), A(0, 0, w, 0, HALF) ],
});

/* A window: the wall opening runs along +X from the base point, wall thickness
   along +Y. Two faces and the glass line between them. */
const window_ = (w, t = 0.15) => ({
  label: `Window ${Math.round(w*1000)}`, group: 'Openings',
  base: {x:0, y:0},
  ents: [ L(0, 0, w, 0), L(0, t, w, t), L(0, t/2, w, t/2),
          L(0, 0, 0, t), L(w, 0, w, t) ],
});

export const SYMBOLS = {
  'door-70':  door(0.70),
  'door-80':  door(0.80),
  'door-90':  door(0.90),
  'win-60':   window_(0.60),
  'win-100':  window_(1.00),
  'win-150':  window_(1.50),

  /* ---- sanitary: base point at the back centre, against the wall ---- */
  'wc': {
    label: 'WC', group: 'Bathroom', base: {x:0, y:0},
    ents: [ R(-0.18, 0, 0.36, 0.16),                 // cistern
            A(0, 0.40, 0.19, -Math.PI, Math.PI),     // bowl
            L(-0.13, 0.16, -0.13, 0.34), L(0.13, 0.16, 0.13, 0.34) ],
  },
  'basin': {
    label: 'Basin', group: 'Bathroom', base: {x:0, y:0},
    ents: [ R(-0.275, 0, 0.55, 0.42), C(0, 0.23, 0.155), C(0, 0.07, 0.022) ],
  },
  'shower-90': {
    label: 'Shower 900', group: 'Bathroom', base: {x:0, y:0},
    ents: [ R(-0.45, 0, 0.90, 0.90), L(-0.45, 0, 0.45, 0.90), L(0.45, 0, -0.45, 0.90),
            C(0, 0.45, 0.04) ],
  },
  'bath-170': {
    label: 'Bath 1700', group: 'Bathroom', base: {x:0, y:0},
    ents: [ R(0, 0, 1.70, 0.75), R(0.06, 0.06, 1.58, 0.63), C(1.52, 0.375, 0.035) ],
  },

  /* ---- kitchen ---- */
  'sink': {
    label: 'Sink', group: 'Kitchen', base: {x:0, y:0},
    ents: [ R(0, 0, 0.80, 0.50), R(0.06, 0.08, 0.42, 0.34), C(0.66, 0.13, 0.035) ],
  },
  'stove-60': {
    label: 'Stove 600', group: 'Kitchen', base: {x:0, y:0},
    ents: [ R(0, 0, 0.60, 0.60), C(0.17, 0.17, 0.07), C(0.43, 0.17, 0.07),
            C(0.17, 0.43, 0.09), C(0.43, 0.43, 0.09) ],
  },
  'fridge-60': {
    label: 'Fridge 600', group: 'Kitchen', base: {x:0, y:0},
    ents: [ R(0, 0, 0.60, 0.65), L(0.05, 0.60, 0.55, 0.60) ],
  },

  /* ---- furniture: base point at the front-left corner ---- */
  'bed-90': {
    label: 'Bed 900 (single)', group: 'Furniture', base: {x:0, y:0},
    ents: [ R(0, 0, 0.90, 2.00), R(0.10, 1.62, 0.70, 0.30) ],
  },
  'bed-140': {
    label: 'Bed 1400 (double)', group: 'Furniture', base: {x:0, y:0},
    ents: [ R(0, 0, 1.40, 2.00), R(0.08, 1.62, 0.58, 0.30), R(0.74, 1.62, 0.58, 0.30) ],
  },
  'table-120': {
    label: 'Table 1200×800', group: 'Furniture', base: {x:0, y:0},
    ents: [ R(0, 0, 1.20, 0.80) ],
  },
  'chair': {
    label: 'Chair', group: 'Furniture', base: {x:0, y:0},
    ents: [ R(0, 0, 0.45, 0.45), L(0.03, 0.42, 0.42, 0.42) ],
  },
  'sofa-180': {
    label: 'Sofa 1800', group: 'Furniture', base: {x:0, y:0},
    ents: [ R(0, 0, 1.80, 0.85), R(0, 0.62, 1.80, 0.23),
            R(0, 0, 0.18, 0.62), R(1.62, 0, 0.18, 0.62) ],
  },

  /* ---- annotation ---- */
  'north': {
    label: 'North arrow', group: 'Annotation', base: {x:0, y:0},
    ents: [ C(0, 0, 0.30),
            L(0, -0.30, 0, 0.30), L(0, 0.30, -0.10, 0.06), L(0, 0.30, 0.10, 0.06),
            {id:id(), type:'text', x:-0.055, y:0.36, h:0.14, str:'N'} ],
  },
};

/* How many drawing units are in a metre. A drawing that says nothing is
   assumed to be centimetres, which is this engine's default. */
const PER_METRE = { mm: 1000, cm: 100, m: 1 };

/* A library symbol as a block definition in the drawing's units. Returns null
   for a name that is not in the library, so callers can just try. */
export function symbolDef(key, units = 'cm'){
  const sym = SYMBOLS[key];
  if (!sym) return null;
  const f = PER_METRE[units] || PER_METRE.cm;
  const P = p => ({...p, x: p.x*f, y: p.y*f});
  return {
    base: {x: sym.base.x*f, y: sym.base.y*f},
    ents: sym.ents.map(e => {
      const o = {...e};
      if (o.type === 'line'){ o.x1*=f; o.y1*=f; o.x2*=f; o.y2*=f; }
      else if (o.type === 'circle' || o.type === 'arc'){ o.cx*=f; o.cy*=f; o.r*=f; }
      else if (o.type === 'pline'){ o.pts = o.pts.map(P); }
      else if (o.type === 'text'){ o.x*=f; o.y*=f; o.h*=f; }
      return o;
    }),
  };
}

export const SYMBOL_KEYS = Object.keys(SYMBOLS);
