/* The AutoCAD Color Index: canonical table, number↔hex↔name, and the
   layer color palette dialog that speaks it. */
import { setupDOM, check, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const A = await import('../js/core/aci.js');
const CU = await import('../js/adapters/dom/colorui.js');

/* ===== the table is AutoCAD's, exactly ===== */
check('256 entries', A.ACI.length===256);
check('the classics: 1 red … 7 white', A.aciHex(1)==='#ff0000' && A.aciHex(2)==='#ffff00' &&
      A.aciHex(3)==='#00ff00' && A.aciHex(4)==='#00ffff' && A.aciHex(5)==='#0000ff' &&
      A.aciHex(6)==='#ff00ff' && A.aciHex(7)==='#ffffff');
check('253 is THE light gray (#999999)', A.aciHex(253)==='#999999');
check('grayscale run 250–255 ascends', A.aciHex(250)<A.aciHex(255));
check('names: when someone says the color, they say this',
      A.aciName(1)==='red' && A.aciName(5)==='blue' && A.aciName(7)==='white' && A.aciName(42)===null);

/* ===== hex → index ===== */
check('exact match prefers the classic low index (red = 1, never 10)', A.aciOf('#ff0000')===1);
check('exact match on a chromatic entry', A.aciOf(A.aciHex(142))===142);
check('nearest for off-index colors', A.aciOf('#fe0102')===1 && A.aciOf('#9a9a9a')===253);
check('index 0 (ByBlock) is never returned', A.aciOf('#000000')!==0);

/* ===== the dialog drives the current layer ===== */
S.setCurrentLayer('0');
C.startCommand('COL');
const dlg = document.getElementById('colorDlg');
check('typed COL opens the palette', dlg.style.display==='block');
check('grid holds all 240 chromatic + 15 classic/gray swatches',
      document.getElementById('colorGrid').children.length===240 &&
      document.getElementById('colorClassic').children.length===15);
// click "color 253": the classic strip is 1..9 then 250..255 → position 12
const sw253 = document.getElementById('colorClassic').children[12];
sw253.listeners.click.forEach(fn=>fn({}));
check('clicking a swatch recolors the current layer', S.layerOf('0').color==='#999999');
check('…and says the number out loud', dom.logs.some(l=>l.includes('color 253')));
CU.closeColor();
check('Close hides it', dlg.style.display==='none');

/* ===== export speaks the same number ===== */
const X = await import('../js/core/dxfwrite.js');
const out = X.buildDXF({units:'m', layers:[{name:'0', color:'#999999'}], entities:[]});
check('a 253 layer exports as ACI 253', out.includes('\n62\n253\n'));

finish();
