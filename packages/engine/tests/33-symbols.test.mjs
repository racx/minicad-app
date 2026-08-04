/* The symbol library: doors, windows, sanitary ware, furniture.
   The library is drawn in METRES because that is what a door is. The drawing
   might be in millimetres. Everything below exists because getting that wrong
   inserts a door eighty metres wide and nothing says a word.
   CORE-DIRECT suite (no DOM stub). */
import { check, near, finish } from './stub-dom.mjs';
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const E = await import('../js/core/entities.js');
const Y = await import('../js/core/symbols.js');

const reset = () => {
  S.setEntities([]); S.setBlocks({}); S.setIdSeq(1);
  S.selection.clear(); S.undoStack.length = 0; C.cancelCmd(true);
};
const width = ents => {
  let x0 = Infinity, x1 = -Infinity;
  for (const e of ents){ const b = E.entBBox(e); x0 = Math.min(x0, b[0]); x1 = Math.max(x1, b[2]); }
  return x1 - x0;
};

/* ===== 1. a door is 0.8 m in every unit the engine has ===== */
for (const [units, expect] of [['m', 0.8], ['cm', 80], ['mm', 800]]){
  const def = Y.symbolDef('door-80', units);
  check(`a door is ${expect} in ${units}`, near(width(def.ents), expect, 1e-9));
}
check('an unknown symbol is null, not a broken definition', Y.symbolDef('nope', 'cm') === null);
check('an unknown UNIT falls back to centimetres rather than 1:1',
      near(width(Y.symbolDef('door-80', 'furlongs').ents), 80, 1e-9));

/* the whole catalogue has to be sane, not just the one I checked by hand */
for (const [key, sym] of Object.entries(Y.SYMBOLS)){
  const def = Y.symbolDef(key, 'm');
  const w = width(def.ents);
  check(`${key}: real-world sized in metres (0.1–3 m), and has a label and a group`,
        w > 0.1 && w < 3 && !!sym.label && !!sym.group && def.ents.length > 0);
  check(`${key}: carries no layer, so it takes the layer you insert it on`,
        def.ents.every(e => e.layer === undefined));
}

/* ===== 2. inserting one ===== */
reset();
S.setUnits('cm');
check('the library is not in a fresh drawing until it is used',
      Object.keys(S.blocks).length === 0);

C.startCommand('I');
C.handleEnter('door-80');
C.onPoint({x:100, y:50});
C.handleEnter('');                      // scale <1>
C.handleEnter('');                      // angle <0>
const e = S.entities[0];
check('a symbol inserts like any other block',
      S.entities.length === 1 && e.type === 'insert' && e.name === 'door-80');
check('…and copying it in defined a block in THIS drawing', !!S.blockDef('door-80'));
check('…sized for the drawing, not the library', near(width([e]), 80, 1e-9));
check('…at the point given', near(e.x, 100) && near(e.y, 50));

// second use must not redefine it
const before = S.blockDef('door-80');
C.startCommand('I'); C.handleEnter('door-80'); C.onPoint({x:0, y:0});
C.handleEnter(''); C.handleEnter('');
check('inserting it again reuses the definition', S.blockDef('door-80') === before);
check('…so two doors are two references to one block',
      S.entities.length === 2 && Object.keys(S.blocks).length === 1);

/* a millimetre drawing gets a millimetre door */
reset();
S.setUnits('mm');
C.startCommand('I'); C.handleEnter('door-80'); C.onPoint({x:0, y:0});
C.handleEnter(''); C.handleEnter('');
check('the same symbol in a mm drawing is 800 wide', near(width([S.entities[0]]), 800, 1e-9));

/* ===== 3. it is an ordinary block once inserted ===== */
reset();
S.setUnits('cm');
C.startCommand('I'); C.handleEnter('chair'); C.onPoint({x:0, y:0});
C.handleEnter('2');                     // twice size
C.handleEnter('90');                    // and turned
const chair = S.entities[0];
check('scale and rotation apply to a symbol like any block',
      near(chair.s, 2) && near(chair.rot, Math.PI/2, 1e-9));

S.selection.add(chair.id);
C.startCommand('X');
check('a symbol explodes into editable geometry',
      S.entities.length > 1 && S.entities.every(q => q.type !== 'insert'));

/* ===== 4. the door actually looks like a door ===== */
// hinge at the origin, leaf along +Y, swing from the opening back to the leaf:
// insert it at a hinge with the wall running +X and it needs no rotation.
const d = Y.symbolDef('door-80', 'm');
const leaf = d.ents.find(q => q.type === 'line');
const swing = d.ents.find(q => q.type === 'arc');
check('the door leaf stands at the hinge',
      near(leaf.x1, 0) && near(leaf.y1, 0) && near(leaf.x2, 0) && near(leaf.y2, 0.8));
check('…and the swing is a quarter circle about it, the width of the door',
      near(swing.cx, 0) && near(swing.cy, 0) && near(swing.r, 0.8) &&
      near(swing.a0, 0) && near(swing.a1, Math.PI/2, 1e-9));
check('the base point is the hinge, so it lands where you aim',
      near(d.base.x, 0) && near(d.base.y, 0));

finish();
