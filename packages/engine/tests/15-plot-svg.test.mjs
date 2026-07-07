/* Pure SVG sheet renderer: mm dimensions, scale math, palette, footer, test page.
   No DOM stub needed — plot.js is a pure module. */
import { check, near, finish } from './stub-dom.mjs';
const P = await import('../js/core/plot.js');

const layers = [{name:'0',color:'#e8e8e8'},{name:'walls',color:'#4db8ff',off:false},{name:'hid',color:'#f00',off:true}];
const settings = (over={}) => ({paper:'A4', landscape:true, scaleN:50, win:[0,0,400,300],
                                weight:0.35, colors:false, units:'cm', ...over});
const grab = (svg, re) => [...svg.matchAll(re)].map(m=>m.slice(1).map(parseFloat));

/* ===== sheet is real millimetres ===== */
let svg = P.buildPlotSVG({entities:[], layers, settings:settings(), filename:'plan', date:'2026-07-06'});
check('A4 landscape sheet: 297mm × 210mm, 1 unit = 1mm',
      svg.includes('width="297mm"') && svg.includes('height="210mm"') && svg.includes('viewBox="0 0 297 210"'));
check('white background', svg.includes('fill="#fff"'));
check('clip to content area', svg.includes('clipPath id="pwin"'));
check('footer: filename, scale, paper, date, units',
      ['plan','1:50','A4 landscape','2026-07-06','units: cm'].every(s=>svg.includes(s)));

/* ===== scale math: 400 cm at 1:50 must draw 80 mm ===== */
svg = P.buildPlotSVG({entities:[{id:1,type:'line',x1:0,y1:0,x2:400,y2:0,layer:'0'}],
                      layers, settings:settings()});
let [l] = grab(svg, /<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)" stroke="#000" stroke-width="0.35"/g);
check('400 cm line at 1:50 = 80 mm on paper', near(l[2]-l[0], 80) && near(l[1], l[3]));

/* units matter: same numbers in metres at 1:50 → 8000mm/50... use 1:100 → 4000/... */
svg = P.buildPlotSVG({entities:[{id:1,type:'line',x1:0,y1:0,x2:4,y2:0,layer:'0'}],
                      layers, settings:settings({units:'m', scaleN:20, win:[0,0,4,3]})});
[l] = grab(svg, /<line x1="([\d.-]+)" y1="[\d.-]+" x2="([\d.-]+)"/g);
check('4 m line at 1:20 = 200 mm on paper', near(l[1]-l[0], 200));

/* ===== circle + text heights ===== */
svg = P.buildPlotSVG({entities:[
  {id:1,type:'circle',cx:200,cy:150,r:50,layer:'0'},
  {id:2,type:'text',x:0,y:0,h:2.5,str:'hi & <bye>',layer:'0'},
], layers, settings:settings()});
check('r=50cm at 1:50 → r=10mm', svg.includes('r="10"'));
check('text h=2.5cm at 1:50 → 0.5mm font, escaped', svg.includes('font-size="0.5"') && svg.includes('hi &amp; &lt;bye&gt;'));

/* ===== world Y-up maps to paper Y-down ===== */
svg = P.buildPlotSVG({entities:[
  {id:1,type:'line',x1:0,y1:0,x2:0,y2:100,layer:'0'},   // points UP in world
], layers, settings:settings({win:[0,0,100,100]})});
[l] = grab(svg, /<line x1="[\d.-]+" y1="([\d.-]+)" x2="[\d.-]+" y2="([\d.-]+)"/g);
check('world up = smaller paper y', l[1] < l[0]);

/* ===== arc: endpoints + radius in mm ===== */
svg = P.buildPlotSVG({entities:[
  {id:1,type:'arc',cx:0,cy:0,r:100,a0:0,a1:Math.PI/2,layer:'0'},
], layers, settings:settings({win:[-100,-100,100,100]})});
check('arc path radius 20mm at 1:50', /A 20 20 0 0 0/.test(svg));

/* ===== monochrome default; layer colors opt-in; hidden layers dropped ===== */
const ents = [
  {id:1,type:'line',x1:0,y1:0,x2:100,y2:0,layer:'walls'},
  {id:2,type:'line',x1:0,y1:10,x2:100,y2:10,layer:'hid'},
];
svg = P.buildPlotSVG({entities:ents, layers, settings:settings()});
check('mono: wall prints black', svg.includes('stroke="#000"') && !svg.includes('#4db8ff'));
check('hidden layer entity not plotted', (svg.match(/<line /g)||[]).length===2); // 1 entity + 1 footer line
svg = P.buildPlotSVG({entities:ents, layers, settings:settings({colors:true})});
check('colors opt-in uses layer hex', svg.includes('stroke="#4db8ff"'));

/* ===== lineweight choice ===== */
svg = P.buildPlotSVG({entities:[ents[0]], layers, settings:settings({weight:0.1})});
check('hairline stroke-width', svg.includes('stroke-width="0.1"'));

/* ===== dim renders like screen: ext lines + dim line + 2 ticks + value ===== */
svg = P.buildPlotSVG({entities:[
  {id:1,type:'dim',x1:0,y1:0,x2:350,y2:0,off:-30,h:10,layer:'0'},
], layers, settings:settings({win:[0,-60,350,10]})});
check('dim = 5 lines (2 ext + dim + 2 ticks)', (svg.match(/<line /g)||[]).length===5+1);
check('dim value via unit formatting', svg.includes('>350<'));
check('dim text true paper height: h=10cm at 1:50 → 2mm', svg.includes('font-size="2"'));
svg = P.buildPlotSVG({entities:[
  {id:1,type:'dim',x1:0,y1:0,x2:3.5,y2:0,off:-0.3,h:0.1,layer:'0'},
], layers, settings:settings({units:'m', scaleN:20, win:[0,-1,4,1]})});
check('dim value formatted per units (m → 2dp)', svg.includes('>3.50<'));

/* ===== calibration test page ===== */
svg = P.buildTestPageSVG();
check('test page is A4 portrait', svg.includes('width="210mm"') && svg.includes('viewBox="0 0 210 297"'));
const bars = grab(svg, /<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)
  .filter(b=>near(b[1],b[3]) && Math.abs(b[2]-b[0])>=50);
check('horizontal 100mm and 50mm bars exact', bars.some(b=>near(b[2]-b[0],100)) && bars.some(b=>near(b[2]-b[0],50)));
const vbars = grab(svg, /<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)
  .filter(b=>near(b[0],b[2]) && Math.abs(b[3]-b[1])>=50);
check('vertical 100mm bar exact', vbars.some(b=>near(Math.abs(b[3]-b[1]),100)));
check('instruction present', svg.includes('100%') && svg.includes('ruler'));

finish();
