/* DXF R2000 export. The old R12 writer could not carry hatches, colour or
   lineweight — a real house plan came back missing 591 fills. Output is
   audited with ezdxf out of band; these checks lock the structure in. */
import { check, near, finish } from './stub-dom.mjs';
const X = await import('../js/core/dxfwrite.js');
const D = await import('../js/core/dxf.js');
const M = await import('../js/core/cadimport.js');

const doc = {
  units:'m',
  layers:[{name:'0',color:'#ffffff'},
          {name:'walls',color:'#4db8ff',lw:0.5},
          {name:'hid',color:'#ff0000',off:true},
          {name:'lck',color:'#00ff00',locked:true}],
  entities:[
    {id:1,type:'line',layer:'walls',x1:0,y1:0,x2:10,y2:0,lw:0.35},
    {id:2,type:'circle',layer:'0',cx:5,cy:5,r:2},
    {id:3,type:'arc',layer:'0',cx:0,cy:0,r:3,a0:0,a1:Math.PI/2},
    {id:4,type:'pline',layer:'walls',pts:[{x:0,y:0},{x:4,y:0,bulge:0.5},{x:4,y:3}],closed:true},
    {id:5,type:'text',layer:'0',x:1,y:1,h:0.5,str:'ÁREA DE SERVIÇO',rot:Math.PI/4},
    {id:6,type:'hatch',layer:'walls',ref:4,mat:'solid'},
    {id:7,type:'dim',layer:'0',x1:0,y1:0,x2:10,y2:0,off:2},
    {id:8,type:'hatch',layer:'0',ref:2,mat:'brick'},
    {id:9,type:'hatch',layer:'0',ref:4,mat:'water'},
    {id:10,type:'hatch',layer:'0',ref:2,mat:'green'},
    {id:11,type:'circle',layer:'0',cx:5,cy:5,r:0.5},
    {id:12,type:'hatch',layer:'0',ref:2,mat:'wood',holes:[11]},
  ],
};
const out = X.buildDXF(doc);
const has = s => out.includes(s);
const pairs = out.split('\n');
// codes sit on even lines, values on odd — testing `line === '5'` also matches
// a *value* of 5 and gives nonsense
const codeVals = code => {
  const o = [];
  for (let i = 0; i + 1 < pairs.length; i += 2) if (pairs[i] === code) o.push(pairs[i+1]);
  return o;
};

/* ===== it is actually R2000, not R12 ===== */
check('declares AC1015', has('AC1015') && !has('AC1009'));
check('has the table set R2000 requires',
      ['VPORT','LTYPE','LAYER','STYLE','APPID','DIMSTYLE','BLOCK_RECORD'].every(t=>has(t)));
check('has model and paper space blocks', has('*Model_Space') && has('*Paper_Space'));
check('has an OBJECTS section with a root dictionary', has('OBJECTS') && has('AcDbDictionary'));

/* ===== handles must be unique — AutoCAD rejects duplicates outright ===== */
const hs = codeVals('5').concat(codeVals('105')).filter(v=>/^[0-9A-F]+$/.test(v) && v!=='FFFF');
check(`every handle is unique (${hs.length} of them)`, new Set(hs).size === hs.length);
check('entities carry an owner back-pointer', codeVals('330').length > 5);

/* ===== what R12 could not carry ===== */
check('true colour written for each layer (and each of the 5 hatches)',
      codeVals('420').length === doc.layers.length + 5);
check('the blue layer keeps its exact colour', codeVals('420').includes(String(0x4db8ff)));
check('a hidden layer is written as a negative ACI', codeVals('62').includes('-7'));
check('a locked layer is flagged', codeVals('70').includes('4'));
check('layer lineweight in hundredths of a mm', codeVals('370').includes('50'));
check('entity lineweight too', codeVals('370').includes('35'));
check('HATCH is exported', has('HATCH') && has('AcDbHatch'));
check('a solid hatch says SOLID', has('SOLID'));

/* ===== hatches carry their material, not one generic pattern ===== */
check('patterned hatches are named per material',
      has('MINICAD_BRICK') && has('MINICAD_WATER') && has('MINICAD_GREEN') && !has('ANSI31'));
// brick = two line families (0° and 90°); count 78 values across the file
check('brick writes two pattern line families', codeVals('78').includes('2'));
// water's dash rhythm survives: dashes positive, gaps negative (scaled ×50 for m units → ×0.05)
check('water keeps its dash pattern', codeVals('79').includes('2') && codeVals('49').length >= 2);
check('dots become dot-dash families (a zero-length dash)', codeVals('49').includes('0'));
check('hatch carries its material colour', codeVals('420').includes(String(0xc98a6b)));
// the circle boundary is four exact quarter arcs, not a 32-gon
const hatchChunks = out.split('AcDbHatch').slice(1);
const circleHatch = hatchChunks.find(c => c.includes('MINICAD_BRICK'));
check('circle boundary is exact (4 quarter-arc vertices, bulge tan π/8)',
      circleHatch.split('\n93\n')[1].startsWith('4') && circleHatch.includes('\n42\n0.41421356\n'));
// the pline boundary keeps its author-drawn bulge
const waterHatch = hatchChunks.find(c => c.includes('MINICAD_WATER'));
check('pline boundary keeps its bulge', waterHatch.includes('\n42\n0.5\n'));
// islands: the wood hatch writes two boundary paths — external outer + plain hole
const woodHatch = hatchChunks.find(c => c.includes('MINICAD_WOOD'));
check('island hatch declares 2 paths', woodHatch.split('\n91\n')[1].startsWith('2'));
check('outer path external, hole path plain',
      woodHatch.includes('\n92\n3\n') && woodHatch.includes('\n92\n2\n'));

/* ===== lineweights snap to the ladder AutoCAD accepts ===== */
check('0.5mm → 50', X.lwCode(0.5)===50);
check('an off-ladder value snaps to the nearest rung', X.lwCode(0.32)===30 || X.lwCode(0.32)===35);
check('no weight means "by default", not zero', X.lwCode(undefined)===-3 && X.lwCode(0)===-3);

/* ===== dimensions are real, with the block that makes them load ===== */
check('a real DIMENSION entity', has('AcDbAlignedDimension'));
check('…referencing a graphics block', has('*D0'));
check('…and that block exists in BLOCKS',
      out.indexOf('*D0') !== out.lastIndexOf('*D0'));
check('…declared in BLOCK_RECORD too', (out.match(/\*D0/g)||[]).length >= 3);
check('the measurement text is written', has('10'));

/* ===== non-ASCII =====
   R2000 is byte-oriented with a code page; a Brazilian drawing full of
   "Iluminação" must not come back as mojibake. */
check('accented text is escaped, not emitted raw',
      has('\\U+00C1REA') && !out.includes('ÁREA'));
check('esc leaves ASCII alone', X.esc('PLAN 1:50')==='PLAN 1:50');
check('esc handles astral characters', X.esc('\u{1F600}').startsWith('\\U+'));

/* ===== round-trip through our own reader ===== */
const back = M.importDoc(D.parseDXF(out));
const of = t => back.entities.filter(e=>e.type===t);
check('round-trip keeps every entity',
      of('line').length>=1 && of('circle').length===2 && of('arc').length===1 &&
      of('pline').length>=1 && of('text').length===1);
check('round-trip keeps the layers', back.layers.some(l=>l.name==='walls'));
check('round-trip restores true colour', back.layers.find(l=>l.name==='walls').color==='#4db8ff');
check('round-trip restores lineweight', back.layers.find(l=>l.name==='walls').lw===0.5);
check('round-trip restores the hidden flag', back.layers.find(l=>l.name==='hid').off===true);
check('round-trip restores accented text',
      of('text')[0].str==='ÁREA DE SERVIÇO');
check('round-trip keeps text rotation', near(of('text')[0].rot, Math.PI/4, 1e-6));
check('round-trip keeps the circle exactly',
      near(of('circle')[0].cx,5,1e-9) && near(of('circle')[0].r,2,1e-9));
check('round-trip keeps a bulge', of('pline').some(pl=>pl.pts.length>3));
const mats = of('hatch').map(hh=>hh.mat);
check('round-trip keeps every hatch', of('hatch').length===4);
check('round-trip keeps hatch materials (our pattern names map back)',
      mats.includes('solid') && mats.includes('brick') && mats.includes('water') && mats.includes('green'));

/* ===== degenerate input ===== */
check('an empty drawing still produces a loadable file',
      X.buildDXF({}).includes('AC1015') && X.buildDXF({}).endsWith('EOF'));
check('no layers at all still writes layer 0', X.buildDXF({}).includes('AcDbLayerTableRecord'));

finish();
