/* HATCH (material fills on closed shapes) + AREA (bulge-aware measurement). */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/main.js');
const S = await import('../js/state.js');
const C = await import('../js/commands.js');
const G = await import('../js/geometry.js');
const E = await import('../js/entities.js');
const M = await import('../js/materials.js');
const P = await import('../js/plot.js');

S.T.osnap=false; S.T.ortho=false; S.T.snap=false;
const reset=()=>{S.setEntities([]);S.undoStack.length=0;S.selection.clear();C.cancelCmd(true);};
const rect=(x0,y0,x1,y1)=>{ const e={id:S.nextId(), type:'pline', closed:true, layer:'0',
  pts:[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}]}; S.entities.push(e); return e; };

/* ===== area math ===== */
check('rectangle area + perimeter', (()=>{ const a=G.plineArea({type:'pline',closed:true,
  pts:[{x:0,y:0},{x:10,y:0},{x:10,y:5},{x:0,y:5}]}); return near(a.area,50)&&near(a.perim,30); })());
check('full circle as two bulge-1 segments = πr²', (()=>{ const a=G.plineArea({type:'pline',closed:true,
  pts:[{x:0,y:0,bulge:1},{x:10,y:0,bulge:1}]}); return near(a.area, Math.PI*25, 1e-6) && near(a.perim, Math.PI*10, 1e-6); })());
check('CW winding gives the same area', (()=>{ const a=G.plineArea({type:'pline',closed:true,
  pts:[{x:10,y:0,bulge:-1},{x:0,y:0,bulge:-1}]}); return near(a.area, Math.PI*25, 1e-6); })());
check('rect + outward semicircular bay adds πr²/2', (()=>{ const a=G.plineArea({type:'pline',closed:true,
  pts:[{x:0,y:0,bulge:1},{x:10,y:0},{x:10,y:10},{x:0,y:10}]});   // CCW rect; bottom bows outward (down = apex right)
  return near(a.area, 100 + Math.PI*25/2, 1e-6); })());
check('inward bay subtracts', (()=>{ const a=G.plineArea({type:'pline',closed:true,
  pts:[{x:0,y:0,bulge:-1},{x:10,y:0},{x:10,y:10},{x:0,y:10}]});
  return near(a.area, 100 - Math.PI*25/2, 1e-6); })());
check('entityArea on a circle', (()=>{ const a=G.entityArea({type:'circle',cx:0,cy:0,r:5});
  return near(a.area, Math.PI*25) && near(a.perim, Math.PI*10); })());
check('entityArea null for open pline', G.entityArea({type:'pline',closed:false,pts:[{x:0,y:0},{x:1,y:1}]})===null);

/* ===== HATCH command flow (material via chooseHatchMaterial, like the dialog does) ===== */
reset();
const room = rect(0,0,100,50);
C.startCommand('H');
check('HATCH waits for a material', S.cmd && S.cmd.name==='HATCH' && S.cmd.step==='mat');
C.chooseHatchMaterial('concrete');
check('material chosen → pick step', S.cmd.step==='pick');
C.onPoint({x:50,y:25});                                  // click inside → boundary found via its edge? interior!
check('hatch created on the room', S.entities.some(e=>e.type==='hatch' && e.ref===room.id && e.mat==='concrete'));
check('creation logs the area', dom.logs.some(l=>l.includes('area') && l.includes('5000')));

/* re-hatching the same boundary swaps the material instead of stacking */
C.startCommand('HATCH');
C.chooseHatchMaterial('green');
C.onPoint({x:50,y:25});
const hatches = S.entities.filter(e=>e.type==='hatch');
check('re-hatch replaces material, no duplicate', hatches.length===1 && hatches[0].mat==='green');
C.cancelCmd(true);

/* refusals */
C.startCommand('H');
C.chooseHatchMaterial('glass');
S.entities.push({id:S.nextId(), type:'pline', closed:false, layer:'0', pts:[{x:200,y:0},{x:300,y:0},{x:300,y:50}]});
C.onPoint({x:300,y:25});                                 // on the open pline's edge
check('open pline refused with JOIN hint', dom.logs.some(l=>l.includes("isn't closed")));
C.cancelCmd(true);

/* ===== hatch entity behavior ===== */
const hatch = S.entities.find(e=>e.type==='hatch');
check('hatch hit from inside, never beats edges', E.entHitDist(hatch,{x:50,y:25}) > 0 &&
      E.entHitDist(hatch,{x:50,y:25}) < 8/S.view.scale && E.entHitDist(hatch,{x:500,y:500})===Infinity);
check('hatch bbox = boundary bbox', JSON.stringify(E.entBBox(hatch))===JSON.stringify(E.entBBox(room)));
E.translateEnt(room, 10, 0);
check('moving the boundary carries the hatch (bbox follows)', near(E.entBBox(hatch)[0], 10));
E.translateEnt(room, -10, 0);

/* ===== AREA command ===== */
C.startCommand('AREA');
C.onPoint({x:50,y:25});                                  // hits the hatch interior
check('AREA reports the hatch material + m²', dom.logs.some(l=>l.includes('Green area') && l.includes('5000')));
C.startCommand('AA');
S.entities.push({id:S.nextId(), type:'circle', cx:400, cy:400, r:10, layer:'0'});
C.onPoint({x:410,y:400});
check('AREA on a circle', dom.logs.some(l=>l.includes('Circle — area')));
C.cancelCmd(true);

/* ===== erase cascade ===== */
reset();
const r2 = rect(0,0,10,10);
S.entities.push({id:S.nextId(), type:'hatch', ref:r2.id, mat:'wood', layer:'0'});
S.selection.add(r2.id);
C.startCommand('E');                                     // ERASE with boundary selected
check('erasing the boundary removes its hatch too', S.entities.length===0);

/* ===== explode cascade ===== */
reset();
const r3 = rect(0,0,10,10);
S.entities.push({id:S.nextId(), type:'hatch', ref:r3.id, mat:'water', layer:'0'});
S.selection.add(r3.id);
C.startCommand('X');
check('exploding a hatched outline removes the hatch', S.entities.every(e=>e.type==='line') &&
      dom.logs.some(l=>l.includes('hatch') && l.includes('removed')));

/* ===== COPY remaps the hatch to the copied boundary ===== */
reset();
const r4 = rect(0,0,10,10);
const h4 = {id:S.nextId(), type:'hatch', ref:r4.id, mat:'brick', layer:'0'};
S.entities.push(h4);
S.selection.add(r4.id); S.selection.add(h4.id);
C.startCommand('CO');
C.onPoint({x:0,y:0});                                    // base
C.onPoint({x:50,y:0});                                   // dest
C.handleEnter('');                                       // end copy
const newHatch = S.entities.filter(e=>e.type==='hatch' && e.id!==h4.id)[0];
const newRect  = S.entities.filter(e=>e.type==='pline' && e.id!==r4.id)[0];
check('copied hatch points at the copied outline', newHatch && newRect && newHatch.ref===newRect.id);

/* ===== plot: hatch prints as a pattern under the linework ===== */
reset();
const r5 = rect(0,0,100,50);
S.entities.push({id:S.nextId(), type:'hatch', ref:r5.id, mat:'concrete', layer:'0'});
const svg = P.buildPlotSVG({entities:S.entities, layers:S.layers,
  settings:{paper:'A4', landscape:true, scaleN:50, win:[0,0,100,50], weight:0.35, colors:false, units:'cm'}});
check('plot embeds the material pattern def', svg.includes('hpat-concrete') && svg.includes('<pattern'));
check('plot fills the boundary with it', svg.includes('fill="url(#hpat-concrete)"'));

finish();
