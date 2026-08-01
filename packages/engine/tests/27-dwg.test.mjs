/* DWG support: the client half only.
   Conversion itself lives in packages/dwg (GPL subprocess behind Rails POST /api/dwg),
   so here we stub the endpoint and prove the engine speaks to it correctly and
   fails in plain language when it can't. */
import { setupDOM, fakeBinFile, dwgBytes, stubFetch, check, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S  = await import('../js/core/state.js');
const C  = await import('../js/core/commands.js');
const IO = await import('../js/adapters/dom/io.js');
const W  = await import('../js/core/dwg.js');

S.T.osnap=false; S.T.ortho=false;

const DXF = ['0','SECTION','2','ENTITIES',
             '0','LINE','8','walls','10','0','20','0','11','100','21','0',
             '0','ENDSEC','0','EOF'].join('\n');

const settle = ()=>new Promise(r=>setTimeout(r,0));   // openDWG's onload is async

/* ===== the DWG magic check ===== */
check('recognises a DWG version stamp', W.looksLikeDWG(dwgBytes('AC1015'))===true);
check('recognises the newest stamp',    W.looksLikeDWG(dwgBytes('AC1032'))===true);
check('rejects a DXF pretending to be DWG',
      W.looksLikeDWG(new TextEncoder().encode('  0\nSECTION\n'))===false);
check('rejects an empty file', W.looksLikeDWG(new Uint8Array(0))===false);
check('rejects "AC" followed by non-digits',
      W.looksLikeDWG(new TextEncoder().encode('ACXXXX and more'))===false);

/* ===== dwgToDxf: request shape ===== */
let calls = stubFetch(()=>({status:200, body:DXF}));
let out = await W.dwgToDxf(dwgBytes());
check('dwgToDxf returns the DXF text', out===DXF);
check('posts to the /api/dwg endpoint', calls[0].url===W.DWG_ENDPOINT);
check('posts as binary', calls[0].opts.method==='POST' &&
      calls[0].opts.headers['Content-Type']==='application/octet-stream');
check('sends the bytes unchanged', calls[0].opts.body instanceof Uint8Array);

calls = stubFetch(()=>({status:200, body:DXF}));
await W.dwgToDxf(dwgBytes(), {endpoint:'/somewhere/else'});
check('endpoint is overridable', calls[0].url==='/somewhere/else');

/* ===== dwgToDxf: every failure gives a human message ===== */
const failsWith = async (resp, re)=>{
  stubFetch(()=>resp);
  try { await W.dwgToDxf(dwgBytes()); return false; }
  catch(e){ return e instanceof W.DwgError && re.test(e.message); }
};
check('network failure explains itself',
      await failsWith({networkError:true}, /could not reach|internet/i));
check('service down (503) suggests a way out',
      await failsWith({status:503, body:{error:'The DWG converter is not running.'}}, /not running/i));
check('missing endpoint (404) suggests exporting DXF instead',
      await failsWith({status:404, body:''}, /DXF/i));
check('a bad DWG passes the server message through',
      await failsWith({status:400, body:{error:'That DWG could not be read. It may be damaged.'}},
                      /damaged/i));
check('a non-JSON error body still yields a message',
      await failsWith({status:400, body:'<html>gateway error</html>'}, /could not be read/i));
check('an empty 200 is treated as failure',
      await failsWith({status:200, body:'   '}, /returned nothing|damaged/i));
check('errors never leak HTML at the user',
      await failsWith({status:500, body:'<html><body>500</body></html>'}, /^[^<]*$/));

/* ===== openDWG end to end ===== */
S.setEntities([]); S.undoStack.length=0; dom.logs.length=0;
C.startCommand('L'); C.handleEnter('0,0'); C.handleEnter('5,5'); C.handleEnter('');
S.undoStack.length=0;
stubFetch(()=>({status:200, body:DXF}));
IO.openDWG(fakeBinFile('plan.dwg', dwgBytes()));
await settle();
check('openDWG loads the converted drawing', S.entities.length===1 && S.entities[0].type==='line');
check('openDWG keeps layers from the DXF', S.entities[0].layer==='walls');
check('openDWG is one undo step', S.undoStack.length===1);
check('openDWG says which file it opened', dom.logs.some(l=>/plan\.dwg/.test(l)));
check('openDWG tells the user it is converting', dom.logs.some(l=>/converting/i.test(l)));

// a file that isn't a DWG never reaches the network
let reached = false;
stubFetch(()=>{ reached = true; return {status:200, body:DXF}; });
dom.logs.length=0;
IO.openDWG(fakeBinFile('notes.dwg', new TextEncoder().encode('just some text')));
await settle();
check('a non-DWG is refused before uploading anything', reached===false);
check('and the user is told why', dom.logs.some(l=>/does not look like a DWG/i.test(l)));

// conversion failure leaves the drawing alone
const before = S.entities.length;
stubFetch(()=>({status:400, body:{error:'That DWG could not be read. It may be damaged.'}}));
dom.logs.length=0;
IO.openDWG(fakeBinFile('broken.dwg', dwgBytes()));
await settle();
check('a failed conversion leaves the drawing untouched', S.entities.length===before);
check('a failed conversion reports the reason', dom.logs.some(l=>/damaged/i.test(l)));
check('a failed conversion is not an undo step', S.undoStack.length===1);

// the server can convert a DWG that yields nothing drawable
stubFetch(()=>({status:200, body:['0','SECTION','2','ENTITIES','0','ENDSEC','0','EOF'].join('\n')}));
dom.logs.length=0;
IO.openDWG(fakeBinFile('empty.dwg', dwgBytes()));
await settle();
check('an empty DWG is reported as such, mentioning DWG not DXF',
      dom.logs.some(l=>/DWG/.test(l) && /nothing/i.test(l)));

/* ===== the GPL boundary is structural, not a comment =====
   packages/dwg is GPL-3.0; @minicad/engine is not. If the engine ever imports
   it — or the GPL reader directly — MiniCAD gets relicensed by accident, so
   these checks are the enforcement rather than a note in a README. */
const fs = (await import('node:fs')).promises;
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

async function walk(dir){
  const out = [];
  for (const d of await fs.readdir(new URL(dir, import.meta.url), {withFileTypes:true})){
    if (d.isDirectory()) out.push(...await walk(dir + d.name + '/'));
    else if (d.name.endsWith('.js')) out.push(dir + d.name);
  }
  return out;
}

const files = await walk('../js/');
check('the licence guard actually found engine sources to scan', files.length > 5);
check('core/dwg.js does not touch the GPL reader',
      !/libredwg|mlightcad/i.test(strip(await fs.readFile(new URL('../js/core/dwg.js', import.meta.url), 'utf8'))));

const offenders = [];
for (const f of files){
  const t = strip(await fs.readFile(new URL(f, import.meta.url), 'utf8'));
  if (/['"][^'"]*(packages\/dwg|@minicad\/dwg|libredwg|mlightcad)/i.test(t)) offenders.push(f);
}
check(`no engine module imports the GPL converter (${offenders.join(', ') || 'none'})`,
      offenders.length===0);

finish();
