/* BLOCK / INSERT — symbols you define once and place many times.
   An `insert` owns no geometry: it names a definition and says where, how big
   and which way round. Every subsystem answers by expanding it, so this suite
   checks the expansion itself and then each subsystem through it.
   CORE-DIRECT suite (no DOM stub). */
import { check, near, finish } from './stub-dom.mjs';
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const E = await import('../js/core/entities.js');
const W = await import('../js/core/dxfwrite.js');

const reset = () => {
  S.setEntities([]); S.setBlocks({}); S.setIdSeq(1);
  S.selection.clear(); S.undoStack.length = 0; C.cancelCmd(true);
};
const ins = () => S.entities.find(e => e.type === 'insert');

/* a right-angle "chair": one line along +X, one along +Y, from the origin */
function defineChair(){
  reset();
  S.setBlocks({ chair: { base:{x:0, y:0}, ents:[
    {id:1, type:'line', layer:'0', x1:0, y1:0, x2:2, y2:0},
    {id:2, type:'line', layer:'0', x1:0, y1:0, x2:0, y2:1},
  ]}});
}

/* ===== 1. defining one ===== */
reset();
C.startCommand('L'); C.handleEnter('0,0'); C.handleEnter('2,0'); C.handleEnter('');
const drawn = S.entities[0].id;
S.selection.add(drawn);
C.startCommand('B');
C.onPoint({x:0, y:0});                       // base point
C.handleEnter('bench');
check('BLOCK defines a named definition', !!S.blockDef('bench'));
check('…holding a copy of the geometry', S.blockDef('bench').ents.length === 1);
check('…that is a COPY, not the live object',
      S.blockDef('bench').ents[0] !== S.entities[0]);
check('the selection is replaced by an insert of it',
      S.entities.length === 1 && S.entities[0].type === 'insert' && S.entities[0].name === 'bench');

C.startCommand('B');                          // no selection now
check('BLOCK without a selection refuses', S.cmd === null);

S.selection.add(S.entities[0].id);
C.startCommand('B'); C.onPoint({x:0,y:0}); C.handleEnter('bench');
check('a duplicate name is refused rather than silently overwriting',
      S.blockDef('bench').ents.length === 1);
C.cancelCmd(true);

/* ===== 2. placing one ===== */
defineChair();
C.startCommand('I');
C.handleEnter('nosuch');
check('INSERT refuses a name it does not have', S.cmd && S.cmd.step === 'name');
C.handleEnter('chair');
C.onPoint({x:10, y:5});
C.handleEnter('');                            // scale <1>
C.handleEnter('');                            // angle <0>
check('INSERT places a reference, not a copy of the geometry',
      S.entities.length === 1 && ins().name === 'chair');
check('…at the point given', near(ins().x, 10) && near(ins().y, 5));
check('…and defaults stay off the object', ins().s === undefined && ins().rot === undefined);

const parts = E.blockParts(ins());
check('it expands to its definition, moved to the insertion point',
      parts.length === 2 && near(parts[0].x1, 10) && near(parts[0].y1, 5) && near(parts[0].x2, 12));

/* ===== 3. scale and rotation ===== */
defineChair();
S.entities.push({id:1, type:'insert', name:'chair', x:0, y:0, s:2, layer:'0'});
check('scale multiplies the geometry', near(E.blockParts(S.entities[0])[0].x2, 4));

S.setEntities([{id:1, type:'insert', name:'chair', x:0, y:0, rot:Math.PI/2, layer:'0'}]);
const rotated = E.blockParts(S.entities[0])[0];
check('rotation turns it about the base point',
      near(rotated.x2, 0, 1e-9) && near(rotated.y2, 2, 1e-9));

// the base point is the handle: geometry defined away from the origin still
// lands where you click
S.setBlocks({ far: { base:{x:100, y:100}, ents:[
  {id:1, type:'line', layer:'0', x1:100, y1:100, x2:103, y2:100}] } });
S.setEntities([{id:1, type:'insert', name:'far', x:0, y:0, layer:'0'}]);
const moved = E.blockParts(S.entities[0])[0];
check('the base point is subtracted, so it lands where you put it',
      near(moved.x1, 0) && near(moved.y1, 0) && near(moved.x2, 3));

/* ===== 4. every subsystem answers through the expansion ===== */
defineChair();
S.setEntities([{id:1, type:'insert', name:'chair', x:10, y:0, layer:'0'}]);
const e = S.entities[0];

check('bbox covers the parts', JSON.stringify(E.entBBox(e)) === JSON.stringify([10,0,12,1]));
check('hit-test hits the geometry, not the bounding box',
      near(E.entHitDist(e, {x:11, y:0}), 0) && E.entHitDist(e, {x:11.5, y:0.9}) > 0.4);
check('one grip, at the insertion point',
      E.entGrips(e).length === 1 && near(E.entGrips(e)[0].x, 10));

const snaps = E.snapCandidates(null, [8, -2, 14, 3]);
check('the insertion point is itself a snap',
      snaps.some(s => near(s.p.x, 10) && near(s.p.y, 0)));
check('…alongside the parts\' own snaps (the far end of the arm)',
      snaps.some(s => near(s.p.x, 12) && near(s.p.y, 0)));

E.translateEnt(e, 5, 5);
check('translate moves the reference', near(e.x, 15) && near(e.y, 5));
check('…and the geometry follows', near(E.blockParts(e)[0].x1, 15));

check('window selection uses the real extent',
      E.entInWindow(e, [14, 4, 18, 7], false) === true &&
      E.entInWindow(e, [14, 4, 16, 5.5], false) === false);

/* ===== 5. mirroring a HANDED block ===== */
// the chair is handed: an arm along +X and one along +Y. Mirrored about a
// vertical axis, the +X arm must end up pointing -X.
defineChair();
S.setEntities([{id:1, type:'insert', name:'chair', x:0, y:0, layer:'0'}]);
const m = S.entities[0];
E.mirrorEnt(m, {x:0, y:0}, {x:0, y:1});       // mirror about the Y axis
const mp = E.blockParts(m);
check('a mirrored block is really mirrored, not just moved',
      near(mp[0].x2, -2, 1e-9) && near(mp[0].y2, 0, 1e-9));
check('…and the axis it was symmetric about is untouched',
      near(mp[1].x2, 0, 1e-9) && near(mp[1].y2, 1, 1e-9));

E.mirrorEnt(m, {x:0, y:0}, {x:0, y:1});       // and back
check('mirroring twice returns the original',
      near(E.blockParts(m)[0].x2, 2, 1e-9) && near(E.blockParts(m)[0].y2, 0, 1e-9));

/* ===== 6. explode, and a missing definition ===== */
defineChair();
S.setEntities([{id:1, type:'insert', name:'chair', x:10, y:0, layer:'0'}]);
S.selection.add(1);
C.startCommand('X');
check('EXPLODE turns a block into real geometry',
      S.entities.length === 2 && S.entities.every(q => q.type === 'line'));
check('…in world position', near(S.entities[0].x1, 10));
check('…with real ids of their own',
      S.entities.every(q => typeof q.id === 'number') &&
      S.entities[0].id !== S.entities[1].id);

S.setBlocks({});                              // definition gone: must not throw
const orphan = {id:9, type:'insert', name:'chair', x:1, y:2, layer:'0'};
S.setEntities([orphan]);
check('an insert with no definition is inert, not a crash',
      E.blockParts(orphan).length === 0 &&
      JSON.stringify(E.entBBox(orphan)) === JSON.stringify([1,2,1,2]));

/* ===== 6b. blocks made of blocks =====
   A kitchen is cupboards; a cupboard is a door. The placements compose:
   R(p)·M(p) · R(c)·M(c) = R(p ∓ c) · M(p xor c), because a reflection reverses
   any rotation applied after it. Exact numbers, so the composition is either
   right or the suite says where. */
reset();
S.setBlocks({
  arm:  { base:{x:0, y:0}, ents:[{id:1, type:'line', layer:'0', x1:0, y1:0, x2:2, y2:0}] },
  // a pair of arms: one at the origin, one 10 to the right and turned 90°
  pair: { base:{x:0, y:0}, ents:[
    {id:1, type:'insert', name:'arm', x:0,  y:0, layer:'0'},
    {id:2, type:'insert', name:'arm', x:10, y:0, rot:Math.PI/2, layer:'0'},
  ]},
});
S.setEntities([{id:1, type:'insert', name:'pair', x:0, y:0, layer:'0'}]);
let np = E.blockParts(S.entities[0]);
check('a nested block expands all the way down to geometry',
      np.length === 2 && np.every(q => q.type === 'line'));
check('…the inner placement is honoured', near(np[0].x2, 2) && near(np[1].x1, 10));
check('…including its own rotation', near(np[1].x2, 10, 1e-9) && near(np[1].y2, 2, 1e-9));

// the outer placement composes on top
S.setEntities([{id:1, type:'insert', name:'pair', x:0, y:0, rot:Math.PI/2, s:2, layer:'0'}]);
np = E.blockParts(S.entities[0]);
check('outer rotation and scale compose with the inner ones',
      near(np[0].x2, 0, 1e-9) && near(np[0].y2, 4, 1e-9) &&
      near(np[1].x1, 0, 1e-9) && near(np[1].y1, 20, 1e-9) &&
      near(np[1].x2, -4, 1e-9) && near(np[1].y2, 20, 1e-9));

// mirrored outer, rotated inner: the reflection must reverse the inner turn
S.setEntities([{id:1, type:'insert', name:'pair', x:0, y:0, mir:true, layer:'0'}]);
np = E.blockParts(S.entities[0]);
check('a mirrored parent reverses the child\'s rotation',
      near(np[1].x1, -10, 1e-9) && near(np[1].x2, -10, 1e-9) && near(np[1].y2, 2, 1e-9));

// BLOCK may now be built from a selection that already contains a block
reset();
S.setBlocks({ arm: { base:{x:0,y:0}, ents:[{id:1, type:'line', layer:'0', x1:0, y1:0, x2:2, y2:0}] } });
S.setEntities([{id:1, type:'insert', name:'arm', x:0, y:0, layer:'0'}]);
S.selection.add(1);
C.startCommand('B'); C.onPoint({x:0, y:0}); C.handleEnter('group');
check('BLOCK accepts a selection containing another block', !!S.blockDef('group'));
check('…and it draws', E.blockParts(S.entities[0]).length === 1);

// a definition that reaches itself must stop, not hang the tab
S.setBlocks({ loop: { base:{x:0,y:0}, ents:[
  {id:1, type:'insert', name:'loop', x:1, y:0, layer:'0'},
  {id:2, type:'line', layer:'0', x1:0, y1:0, x2:1, y2:0},
]}});
S.setEntities([{id:1, type:'insert', name:'loop', x:0, y:0, layer:'0'}]);
check('a block containing itself expands once and stops',
      E.blockParts(S.entities[0]).length === 1);

/* ===== 7. it has to survive the round trip ===== */
defineChair();
S.setEntities([{id:1, type:'insert', name:'chair', x:3, y:4, s:2, layer:'0'}]);
const doc = JSON.parse(JSON.stringify(
  {layers:S.layers, entities:S.entities, blocks:S.blocks, idSeq:S.getIdSeq(), units:S.units}));
S.setBlocks({}); S.setEntities([]);
S.setBlocks(doc.blocks); S.setEntities(doc.entities);
check('a saved drawing carries its definitions', !!S.blockDef('chair'));
check('…so the insert still draws after a reload',
      E.blockParts(S.entities[0]).length === 2 && near(E.blockParts(S.entities[0])[0].x2, 7));

/* ===== 8. exported DXF keeps them as symbols ===== */
const D = await import('../js/core/dxf.js');
const M = await import('../js/core/cadimport.js');

reset();
S.setBlocks({ chair: { base:{x:0, y:0}, ents:[
  {id:1, type:'line', layer:'0', x1:0, y1:0, x2:2, y2:0},
  {id:2, type:'line', layer:'0', x1:0, y1:0, x2:0, y2:1}]}});
S.setEntities([
  {id:1, type:'insert', name:'chair', x:3, y:4, s:2, layer:'0'},
  {id:2, type:'insert', name:'chair', x:9, y:0, rot:Math.PI/2, mir:true, layer:'0'},
]);
let dxf = W.buildDXF({entities:S.entities, layers:S.layers, units:'cm', blocks:S.blocks});

check('a BLOCK is declared, not flattened', dxf.includes('\nchair\n'));
check('…with a BLOCK_RECORD to own it', (dxf.match(/\nBLOCK_RECORD\r?\n/g) || []).length >= 3);
check('…and the placements are INSERTs', (dxf.match(/\nINSERT\r?\n/g) || []).length === 2);
check('…so the geometry is written ONCE, not per copy',
      (dxf.match(/\nLINE\r?\n/g) || []).length === 2);

// read our own file back: the round trip is the real proof
let back = M.importDoc(D.parseDXF(dxf));
check('re-reading it gives back two references, not four lines',
      back.entities.filter(e => e.type === 'insert').length === 2 &&
      Object.keys(back.blocks).length === 1);
S.setBlocks(back.blocks);
const a = back.entities.find(e => near(e.x, 3)), b2 = back.entities.find(e => near(e.x, 9));
check('scale survives the trip', near(a.s, 2));
check('rotation survives the trip', near(b2.rot, Math.PI/2, 1e-9));
check('and so does handedness — a mirrored door still opens the other way',
      b2.mir === true);
const arm = E.blockParts(a)[0];
check('the geometry lands where it did before exporting',
      near(arm.x1, 3) && near(arm.y1, 4) && near(arm.x2, 7));

// a block whose definition went missing must still export as a drawing
reset();
S.setEntities([{id:1, type:'insert', name:'ghost', x:0, y:0, layer:'0'}]);
dxf = W.buildDXF({entities:S.entities, layers:S.layers, units:'cm',
                  blocks:{}, expandInsert: E.blockParts});
check('an insert with no definition exports as nothing, not as a broken reference',
      !dxf.includes('\nINSERT\r?\n') && dxf.includes('ENDSEC'));

finish();
