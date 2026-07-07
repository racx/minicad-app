/* UNITS command + persistence + readout; PLOT dialog + window pick + fit math. */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const IO = await import('../js/adapters/dom/io.js');
const P = await import('../js/core/plot.js');
const PU = await import('../js/adapters/dom/plotui.js');
const G = await import('../js/core/geometry.js');

S.T.osnap=false; S.T.ortho=false;
const add=(x1,y1,x2,y2)=>{C.startCommand('L');C.handleEnter(`${x1},${y1}`);C.handleEnter(`${x2},${y2}`);C.handleEnter('');return S.entities[S.entities.length-1];};

/* ===== formatting per unit ===== */
check('formatLen mm=int cm=0.1 m=0.01',
      G.formatLen(12.34,'mm')==='12' && G.formatLen(12.34,'cm')==='12.3' && G.formatLen(12.345,'m')==='12.35');

/* ===== UNITS command ===== */
check('default units cm', S.units==='cm');
C.startCommand('UNITS');
check('prompt shows current', dom.promptEl.textContent.includes('<cm>'));
C.handleEnter('yards');
check('bad unit rejected', dom.logs.some(l=>l.includes('Enter mm, cm or m')) && S.cmd!==null);
C.handleEnter('m');
check('units set to m', S.units==='m' && S.cmd===null);
check('unitFmt follows', S.unitFmt(1.234)==='1.23');
C.startCommand('UNITS'); C.handleEnter('');
check('empty Enter keeps', S.units==='m');

/* ===== units in coordinate readout ===== */
dom.fire('mousemove', {clientX:100, clientY:100});
check('readout carries unit suffix', dom.els.get('coordRead').textContent.includes(' m'));

/* ===== units persist through autosave + JSON save ===== */
add(0,0,100,0);
IO.autosaveTick();
check('autosave stores units', JSON.parse(localStorage.getItem('minicad.autosave')).units==='m');
S.setUnits('cm'); S.setEntities([]);
IO.restoreAutosave();
check('restore brings units back', S.units==='m' && S.entities.length===1);
const box = dom.captureDownload();
IO.saveJSON();
check('JSON save includes units', JSON.parse(box.data).units==='m');
S.setUnits('cm');

/* ===== plot math (pure) ===== */
check('paperSize landscape swaps', P.paperSize('A4',true).w===297 && P.paperSize('A4',false).w===210);
const area = P.contentArea('A4', true);
check('content area = paper - margins - footer', near(area.w,277) && near(area.h,182));
// 1000×700 cm window on A4 landscape: N = max(10000/277, 7000/182) = 38.46 → 39
check('computeFitScale ceils to fit', P.computeFitScale([0,0,1000,700],'A4',true,'cm')===39);
check('fit respects units (m)', P.computeFitScale([0,0,10,7],'A4',true,'m')===39);

/* ===== PLOT dialog ===== */
C.startCommand('PLOT');
check('PLOT opens the dialog', dom.els.get('plotDlg').style.display==='block');
PU.closePlot();
check('close hides it', dom.els.get('plotDlg').style.display==='none');
dom.fireWin('keydown', {key:'p', ctrlKey:true});
check('Ctrl-P opens it too', dom.els.get('plotDlg').style.display==='block');
PU.closePlot();

/* ===== settings resolution ===== */
S.setEntities([]); add(0,0,400,300);
dom.els.get('plotScale').value='50';
let s = PU.currentSettings();
check('default window = drawing extents', s && near(s.win[2],400) && near(s.win[3],300));
check('list scale resolves', s.scaleN===50 && s.paper==='A4' && s.landscape===true);
dom.els.get('plotScale').value='custom'; dom.els.get('plotCustomN').value='75';
check('custom scale resolves', PU.currentSettings().scaleN===75);
dom.els.get('plotScale').value='fit';
check('fit scale computed from window', PU.currentSettings().scaleN===P.computeFitScale([0,0,400,300],'A4',true,'cm'));
dom.els.get('plotScale').value='50';

/* ===== PLOTWIN pick via point machinery (typed coords work too) ===== */
C.startCommand('PLOTWIN');
C.handleEnter('10,10');
C.handleEnter('210,160');
check('print window stored normalized', S.plotWin && near(S.plotWin[0],10) && near(S.plotWin[2],210));
check('dialog reopened after pick', dom.els.get('plotDlg').style.display==='block');
s = PU.currentSettings();
check('picked window used by settings', near(s.win[2]-s.win[0],200) && near(s.win[3]-s.win[1],150));
PU.closePlot();

finish();
