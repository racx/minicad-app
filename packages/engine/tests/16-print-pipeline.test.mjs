/* Print pipeline: dialog settings → sheet HTML with real-mm @page. */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const PU = await import('../js/adapters/dom/plotui.js');
const P = await import('../js/core/plot.js');

S.T.osnap=false; S.T.ortho=false;

/* empty drawing → nothing to print */
check('empty drawing: buildCurrentSVG null', PU.buildCurrentSVG()===null);

/* draw + dimension a wall, print at 1:50 on A4 landscape */
C.startCommand('L'); C.handleEnter('0,0'); C.handleEnter('400,0'); C.handleEnter('');
C.startCommand('DIM'); C.handleEnter('0,0'); C.handleEnter('400,0'); C.handleEnter('200,-40');
dom.els.get('plotScale').value='50';
dom.els.get('plotPaper').value='A4';
dom.els.get('plotOrient').value='L';
const cur = PU.buildCurrentSVG();
check('sheet built with settings echoed', cur && cur.settings.scaleN===50 && cur.size.w===297 && cur.size.h===210);
check('svg is mm-true', cur.svg.includes('width="297mm"'));
check('dim present with value', cur.svg.includes('>400<'));

/* headless print path returns the full page with @page in mm */
const html = PU.printSVG(cur.svg, cur.size);
check('@page real-mm size, zero margin', html.includes('@page{size:297mm 210mm;margin:0}'));
check('sheet embedded in printable page', html.includes('<body><svg') && html.includes('</svg></body>'));

/* calibration page path */
const test = PU.printSVG(P.buildTestPageSVG(), {w:210, h:297});
check('test page prints portrait A4', test.includes('@page{size:210mm 297mm;margin:0}') && test.includes('calibration'));

/* fit mode flows through the pipeline */
dom.els.get('plotScale').value='fit';
const fitCur = PU.buildCurrentSVG();
check('fit resolves to computed scale in the sheet footer',
      fitCur.svg.includes(`1:${fitCur.settings.scaleN}`) &&
      fitCur.settings.scaleN===P.computeFitScale(fitCur.settings.win,'A4',true,'cm'));

finish();
