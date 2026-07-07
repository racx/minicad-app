/* Package face: createEngine / executeScript / serializeContext / renderPlotSVG.
   CORE-DIRECT suite — imports the face exactly like an embedding host. */
import { check, near, finish } from './stub-dom.mjs';
const F = await import('../js/core/index.js');
const S = await import('../js/core/state.js');

S.T.osnap = false; S.T.ortho = false; S.T.snap = false;
S.setEntities([]); S.setLayers([{name:'0', color:'#e8e8e8'}]); S.setCurrentLayer('0');
S.setIdSeq(1); S.setUnits('cm'); S.selection.clear(); S.undoStack.length = 0;

const engine = F.createEngine();
check('createEngine hands back the face bundle',
      typeof engine.executeScript === 'function' && typeof engine.serializeContext === 'function' &&
      typeof engine.renderPlotSVG === 'function' && engine.state === S);

/* the README's embedding example, verbatim shape: 5 lines incl. a HATCH */
const result = engine.executeScript(`
  RECT 0,0 400,300
  LINE 400,80 400,220
  ARC 400,220 330,150 400,80
  HATCH #1 concrete
  AREA #1
`);
check('embedding script runs clean', result.errors.length === 0);
check('4 entities created (rect, line, arc, hatch)', result.created.length === 4);
check('AREA readback in logs', result.logs.some(l => l.text.includes('area 120000 cm²')));

/* serializeContext */
S.selection.add(S.entities[2].id);                    // select the arc
const ctx = F.serializeContext();
check('context: units + counts', ctx.units === 'cm' && ctx.counts.total === 4 &&
      ctx.counts.byType.hatch === 1);
check('selection-first ordering', ctx.entities[0].type === 'arc');
S.entities[2].cx = 123.456789;                        // force an unrounded value
const ctx2 = F.serializeContext();
check('2-decimal rounding applied', ctx2.entities[0].cx === 123.46);
check('rounding is presentation-only (state untouched)', near(S.entities[2].cx, 123.456789));
S.entities[2].cx = Math.round(S.entities[2].cx);
const hatchRow = ctx.entities.find(e => e.type === 'hatch');
check('hatch row carries material + computed area',
      hatchRow.material === 'Concrete' && near(hatchRow.area, 120000) && hatchRow.perimeter > 0);
check('not truncated under the cap', ctx.truncated === false);

/* cap: selection survives truncation */
for (let i = 0; i < 160; i++) engine.executeScript(`CIRCLE ${i*10},1000 r2`);
const big = F.serializeContext();
check('entity table capped at 150', big.entities.length === 150 && big.truncated === true);
check('selected arc still first despite the cap', big.entities[0].type === 'arc');
const tiny = F.serializeContext({ cap: 5 });
check('cap is tunable', tiny.entities.length === 5);

/* renderPlotSVG through the face */
const svg = F.renderPlotSVG({ entities: S.entities, layers: S.layers,
  settings: { paper:'A4', landscape:true, scaleN:50, win:[0,0,400,300], weight:0.35, colors:false, units:'cm' } });
check('renderPlotSVG produces the sheet', svg.startsWith('<svg') && svg.includes('hpat-concrete'));

finish();
