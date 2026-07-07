/* Autosave to localStorage, restore on boot, NEW command. */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const IO = await import('../js/adapters/dom/io.js');

S.T.osnap=false; S.T.ortho=false;

// nothing saved yet
check('no autosave on fresh boot', localStorage.getItem('minicad.autosave')===null);

// draw, tick → saved
C.startCommand('L'); C.handleEnter('0,0'); C.handleEnter('100,0'); C.handleEnter('');
IO.autosaveTick();
const saved = JSON.parse(localStorage.getItem('minicad.autosave'));
check('tick saved the drawing', saved.entities.length===1 && saved.entities[0].x2===100);

// unchanged tick doesn't rewrite (same content is fine either way — just must not throw)
IO.autosaveTick();
check('idempotent tick', JSON.parse(localStorage.getItem('minicad.autosave')).entities.length===1);

// simulate a fresh session: clear state, then restore
S.setEntities([]); S.setIdSeq(1);
check('restore returns true and refills entities', IO.restoreAutosave()===true && S.entities.length===1);
check('idSeq restored past existing ids', S.entities.every(e=>e.id < (saved.idSeq)));

// NEW asks, N keeps
C.startCommand('NEW');
check('NEW asks for confirmation', dom.promptEl.textContent.includes('[Y/N]'));
C.handleEnter('N');
check('N keeps the drawing', S.entities.length===1 && S.cmd===null);

// NEW + Y clears drawing, undo history, autosave
C.startCommand('NEW'); C.handleEnter('Y');
check('Y clears everything', S.entities.length===0 && S.undoStack.length===0);
check('autosave cleared too', localStorage.getItem('minicad.autosave')===null);
check('restore after NEW finds nothing', IO.restoreAutosave()===false);

// empty drawings never autosave-restore (no zombie empty saves)
IO.autosaveTick();
check('empty tick does not create a restorable save', IO.restoreAutosave()===false);

finish();
