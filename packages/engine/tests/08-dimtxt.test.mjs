/* DIMTXT: adjustable dimension text height (0/absent = automatic). */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/main.js');
const S = await import('../js/state.js');
const C = await import('../js/commands.js');
const E = await import('../js/entities.js');

S.T.osnap=false; S.T.ortho=false;
const reset=()=>{ S.setEntities([]); S.undoStack.length=0; S.selection.clear(); };
const makeDim=(x2=100)=>{ C.startCommand('DIM'); C.handleEnter('0,0'); C.handleEnter(`${x2},0`); C.handleEnter('50,20');
                          return S.entities[S.entities.length-1]; };

// default: automatic height = 4% of measured length
reset();
const d1 = makeDim(100);
check('new dim has no explicit height', !('h' in d1));
check('auto height = 4% of length', near(E.dimH(d1), 4));

// DIMTXT prompt shows <auto>, setting a number applies to future dims
C.startCommand('DIMTXT');
check('prompt shows auto default', dom.promptEl.textContent.includes('<auto>'));
C.handleEnter('12');
check('command ended after setting', S.cmd===null);
const d2 = makeDim(100);
check('new dim carries h=12', d2.h===12 && near(E.dimH(d2), 12));

// applying to selected dims, one undo step
S.selection.add(d1.id);
const u0=S.undoStack.length;
C.startCommand('DIMTXT');
check('prompt remembers <12>', dom.promptEl.textContent.includes('<12>'));
C.handleEnter('8');
check('selected dim updated to 8', d1.h===8);
check('one undo step for the update', S.undoStack.length===u0+1);
C.doUndo();
check('undo removes the height change', !('h' in S.entities.find(e=>e.id===d1.id)));

// A = back to automatic (also strips selected dims)
S.selection.clear(); S.selection.add(d2.id);
C.startCommand('DIMTXT'); C.handleEnter('A');
const d2now = S.entities.find(e=>e.id===d2.id);   // doUndo above replaced the array
check('A resets selected dim to auto', !('h' in d2now) && near(E.dimH(d2now), 4));
const d3 = makeDim(200);
check('subsequent dims are auto again', !('h' in d3) && near(E.dimH(d3), 8));

// empty Enter keeps current setting silently
C.startCommand('DIMTXT'); C.handleEnter('');
check('empty Enter just closes', S.cmd===null);

// garbage input rejected, command stays open
C.startCommand('DIMTXT'); C.handleEnter('potato');
check('bad input rejected', S.cmd!==null && dom.logs.some(l=>l.includes('Enter a height')));
C.cancelCmd();

// SCALE scales an explicit height, leaves auto dims auto
reset();
const d4 = makeDim(100); d4.h = 10;
S.selection.add(d4.id);
C.startCommand('SC'); C.handleEnter('0,0'); C.handleEnter('2');
check('scale doubles explicit dim height', near(d4.h,20) && near(E.dimGeom(d4).L,200));

// DXF export uses the explicit height
const box = dom.captureDownload();
const IO = await import('../js/io.js');
IO.dxfExport();
const lines = box.data.split('\n');
const ti = lines.indexOf('TEXT');
const grp = {}; for (let i=ti+1; i<lines.length-1 && lines[i]!=='0'; i+=2) grp[lines[i]]=lines[i+1];
check('DXF text height = explicit h', near(parseFloat(grp['40']), 20));

finish();
