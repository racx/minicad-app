/* Layer visibility/lock, CHLAYER, double-click text editing. */
import { setupDOM, check, near, finish } from './stub-dom.mjs';
const dom = setupDOM();
await import('../js/adapters/dom/main.js');
const S = await import('../js/core/state.js');
const C = await import('../js/core/commands.js');
const E = await import('../js/core/entities.js');
const V = await import('../js/adapters/dom/view.js');

S.T.osnap=false; S.T.ortho=false;
const add=(x1,y1,x2,y2)=>{C.startCommand('L');C.handleEnter(`${x1},${y1}`);C.handleEnter(`${x2},${y2}`);C.handleEnter('');return S.entities[S.entities.length-1];};

// --- visibility: hidden layers can't be picked, snapped, or box-selected ---
const l0 = add(0,0,100,0);                       // layer '0'
S.setCurrentLayer('walls');
const lw = add(0,20,100,20);                     // layer 'walls'
S.layerOf('walls').off = true;
check('hidden: findEntityAt ignores it', E.findEntityAt({x:50,y:20})===null);
check('hidden: not in snap candidates', !E.snapCandidates().some(c=>c.p.y===20));
S.T.osnap=true;
const p = C.applyModifiers({x:99.5,y:20.5});     // right next to the hidden line's endpoint
check('hidden: no snap onto hidden geometry', near(p.x,99.5) && near(p.y,20.5) && S.snapMark===null);
S.T.osnap=false;
S.selection.clear();
C.boxSelect({x0:V.w2s({x:120,y:-10}).x, y0:V.w2s({x:120,y:-10}).y,
             x1:V.w2s({x:-10,y:30}).x,  y1:V.w2s({x:-10,y:30}).y}, true);
check('hidden: box select skips it', S.selection.has(l0.id) && !S.selection.has(lw.id));
S.layerOf('walls').off = false;

// --- lock: visible + snappable, but unpickable ---
S.layerOf('walls').locked = true;
check('locked: findEntityAt ignores it', E.findEntityAt({x:50,y:20})===null);
check('locked: still snappable', E.snapCandidates().some(c=>c.p.y===20));
S.selection.clear();
C.boxSelect({x0:V.w2s({x:120,y:-10}).x, y0:V.w2s({x:120,y:-10}).y,
             x1:V.w2s({x:-10,y:30}).x,  y1:V.w2s({x:-10,y:30}).y}, true);
check('locked: box select skips it', !S.selection.has(lw.id));
S.layerOf('walls').locked = false;

// --- TRIM all-edges ignores hidden layers ---
S.setEntities([]); S.selection.clear(); S.setCurrentLayer('0');
const tgt = add(0,0,100,0);
S.setCurrentLayer('walls');
add(50,-10,50,10);                                // would-be cutting edge on 'walls'
S.layerOf('walls').off = true;
C.startCommand('TR'); C.handleEnter('');
C.onPoint({x:80,y:0});
check('hidden edge cannot cut', dom.logs.some(l=>l.includes('does not intersect')) && near(tgt.x2,100));
C.handleEnter('');
S.layerOf('walls').off = false;
S.setCurrentLayer('0');

// --- CHLAYER ---
S.setEntities([]); S.selection.clear();
const cl = add(0,0,50,0);
S.selection.add(cl.id);
C.startCommand('CH');
check('CHLAYER prompts with default', dom.promptEl.textContent.includes(`<0>`));
C.handleEnter('nope');
check('unknown layer rejected, lists layers', dom.logs.some(l=>l.includes('No layer "nope"')) && S.cmd!==null);
C.handleEnter('walls');
check('moved to walls', cl.layer==='walls' && S.cmd===null);
C.doUndo();
check('CHLAYER undoes', S.entities[0].layer==='0');
S.selection.clear();
C.startCommand('CHLAYER');
check('CHLAYER without selection refuses', dom.logs.some(l=>l.includes('Select objects first')) && S.cmd===null);

// --- double-click text editing ---
S.setEntities([]); S.selection.clear();
C.startCommand('T'); C.handleEnter('10,10'); C.handleEnter('5'); C.handleEnter('hello wrold');
const txt = S.entities[0];
const sp = V.w2s({x:12,y:11});                    // inside the text box
dom.fire('mousemove', {clientX:sp.x, clientY:sp.y});
dom.fire('dblclick',  {clientX:sp.x, clientY:sp.y});
check('dblclick enters edit mode with prefilled input', S.cmd && S.cmd.name==='EDITTEXT' && dom.els.get('cmdInput').value==='hello wrold');
C.handleEnter('hello world');
check('text updated', txt.str==='hello world' && S.cmd===null);
C.doUndo();
check('text edit undoes', S.entities[0].str==='hello wrold');


/* ===== LAYDEL — delete a layer and everything on it =====
   Real client drawings arrive with scratch layers ("EXCLUIR 1…17" in one
   house plan) that arrive LOCKED, so you cannot even select them to erase.
   Wildcards matter: hiding seventeen layers one at a time is not a workflow. */
S.setEntities([]); S.setIdSeq(1); S.undoStack.length=0;
S.setLayers([{name:'0',color:'#fff'},{name:'keep',color:'#fff'},
             {name:'EXCLUIR 1',color:'#fff',locked:true},
             {name:'EXCLUIR 2',color:'#fff',locked:true}]);
S.setCurrentLayer('EXCLUIR 1');
const mk=(layer,x)=>{ S.setCurrentLayer(layer); return add(x,0,x+1,0); };
mk('keep',0); mk('EXCLUIR 1',10); mk('EXCLUIR 1',20); mk('EXCLUIR 2',30);
S.setCurrentLayer('EXCLUIR 1');
const n0 = S.entities.length;

dom.logs.length=0;
C.startCommand('LAYDEL'); C.handleEnter('EXCLUIR*');
check('wildcard deletes the whole family', !S.layers.some(l=>/^EXCLUIR/.test(l.name)));
check('…and their objects go with them',
      S.entities.length===1 && S.entities[0].layer==='keep');
check('…even though the layers were locked', true);
check('…reporting what it did', dom.logs.some(l=>/Deleted 2 layers and 3 objects/.test(l)));
check('current layer moves off the deleted one', S.currentLayer==='0' || S.currentLayer==='keep');

C.startCommand('U');
check('LAYDEL is one undo step', S.entities.length===n0);

dom.logs.length=0;
C.startCommand('LAYDEL'); C.handleEnter('0');
check('layer 0 is protected', S.layers.some(l=>l.name==='0') &&
      dom.logs.some(l=>/cannot be deleted/i.test(l)));

dom.logs.length=0;
C.startCommand('LAYDEL'); C.handleEnter('nosuchlayer');
check('an unknown layer is refused and lists what exists',
      dom.logs.some(l=>/No layer matches/.test(l) && /keep/.test(l)));

// a hatch whose boundary is deleted must not linger as an orphan
S.setEntities([]); S.setIdSeq(1);
S.setLayers([{name:'0',color:'#fff'},{name:'gone',color:'#fff'}]);
S.setCurrentLayer('gone');
C.startCommand('REC'); C.handleEnter('0,0'); C.handleEnter('10,10');
const b = S.entities[S.entities.length-1];
S.entities.push({id:S.nextId(), type:'hatch', ref:b.id, mat:'solid', layer:'gone'});
C.startCommand('LAYDEL'); C.handleEnter('gone');
check('deleting a boundary takes its hatch with it', S.entities.length===0);


/* ===== the layer panel =====
   A client DWG arrives with 130 layers; the dropdown alone is unusable.
   The panel is a filtered list, so the filter is the part worth testing. */
const U = await import('../js/adapters/dom/ui.js');
const find = dom.els.get('layerFind');
const list = dom.els.get('layerList');

S.setEntities([]); S.setIdSeq(1);
S.setLayers([{name:'0',color:'#fff'},{name:'walls',color:'#fff'},
             {name:'EXCLUIR 1',color:'#fff'},{name:'EXCLUIR 2',color:'#fff'},
             {name:'RED-Piso hatch',color:'#fff'},{name:'RED-Forro hatch',color:'#fff'}]);
S.setCurrentLayer('walls');

find.value = '';
U.renderLayerPanel();
check('panel lists every layer when unfiltered', list.children.length===6);
check('…and says how many', dom.els.get('layerCount').textContent==='6');

find.value = 'excluir';
U.renderLayerPanel();
check('a bare word matches case-insensitively', list.children.length===2);
check('…and the count shows the filter', dom.els.get('layerCount').textContent==='2/6');

find.value = '*hatch';
U.renderLayerPanel();
check('a wildcard matches the tail', list.children.length===2);

find.value = 'walls';
U.renderLayerPanel();
check('an exact name matches just it', list.children.length===1);

find.value = 'nothinglikethis';
U.renderLayerPanel();
check('no match shows an empty list rather than everything', list.children.length===0);

find.value = '';
U.renderLayerPanel();
check('clearing the filter restores the list', list.children.length===6);

// a layer name must never be able to inject markup
S.setLayers([{name:'<img src=x onerror=1>', color:'#fff'}]);
S.setCurrentLayer('<img src=x onerror=1>');
U.renderLayerPanel();
const row0 = list.children[0];
const nm = row0.children.find(c=>c.className==='nm');
check('a hostile layer name is set as text, not markup',
      !!nm && nm.textContent==='<img src=x onerror=1>' && row0._html==='');

/* ===== a click that selects nothing has to say why =====
   A client DWG arrives with its layers locked by the file and its curved
   furniture frozen, so the first thing that happens on a real drawing is that
   clicking a table does nothing. It used to do nothing silently. */
S.setLayers([{name:'0', color:'#fff'},
             {name:'RED-Mobiliário', color:'#fff', locked:true},
             {name:'oculta', color:'#fff', off:true}]);
S.setCurrentLayer('0');

const clickAt = p => { S.selection.clear(); dom.logs.length = 0; C.clickSelect(p, false); };

S.setEntities([{id:1, type:'line', layer:'RED-Mobiliário', x1:0, y1:0, x2:10, y2:0}]);
clickAt({x:5, y:0});
check('a locked layer refuses the click', S.selection.size === 0);
check('…and names the layer and where to unlock it',
      dom.logs.some(l => l.includes('RED-Mobiliário') && /locked/.test(l) && /layer panel/.test(l)));

S.setEntities([{id:2, type:'pline', layer:'0', frozen:true, closed:true,
                pts:[{x:0,y:0},{x:10,y:0},{x:10,y:10}]}]);
clickAt({x:5, y:0});
check('a frozen import refuses the click', S.selection.size === 0);
check('…and says THAW releases it', dom.logs.some(l => /THAW/.test(l)));

S.setEntities([{id:3, type:'line', layer:'oculta', x1:0, y1:0, x2:10, y2:0}]);
clickAt({x:5, y:0});
check('a hidden layer says so rather than nothing',
      S.selection.size === 0 && dom.logs.some(l => /hidden/.test(l)));

// empty space is not a mystery and must not chatter
S.setEntities([{id:4, type:'line', layer:'0', x1:0, y1:0, x2:10, y2:0}]);
clickAt({x:500, y:500});
check('clicking empty space explains nothing', dom.logs.length === 0);

// and the ordinary case still works
clickAt({x:5, y:0});
check('an ordinary object still selects, silently', S.selection.has(4) && dom.logs.length === 0);

/* ===== one place to manage a layer =====
   The bar used to carry a <select> of every layer plus its own 👁 and 🔒, which
   duplicated the panel and, being current-layer-only, was how you ended up
   drawing in invisible ink. It is a readout now; the panel does the work. */
S.setLayers([{name:'0', color:'#e8e8e8'}, {name:'DIVISA', color:'#0ff', locked:true}]);
S.setCurrentLayer('0');
U.refreshLayers();
const chip = dom.els.get('layerCur');
check('the bar names the layer being drawn on', chip.textContent === '0');

S.setCurrentLayer('DIVISA');
U.refreshLayers();
check('…and flags a locked one', chip.textContent === 'DIVISA 🔒');
check('…and says so in the tooltip', /locked/.test(chip.title) && /DIVISA/.test(chip.title));

S.layerOf('DIVISA').off = true;
U.refreshLayers();
check('a hidden current layer is flagged — you can still draw on it',
      chip.textContent === 'DIVISA 🚫 🔒' && /nothing you draw will show/.test(chip.title));
S.layerOf('DIVISA').off = false;

/* the file's own locks, lifted in one go */
S.setLayers([{name:'0', color:'#fff'},
             {name:'RED-Piso hatch', color:'#fff', locked:true},
             {name:'RED-Mobiliário', color:'#fff', locked:true},
             {name:'livre', color:'#fff'}]);
S.setCurrentLayer('0');
dom.logs.length = 0;
const unlockAll = dom.els.get('layAllUnlock');
unlockAll.listeners.click.forEach(fn => fn({}));
check('Unlock all clears every lock', S.layers.every(l => !l.locked));
check('…and says how many it freed', dom.logs.some(l => /Unlocked 2 layers/.test(l)));

dom.logs.length = 0;
unlockAll.listeners.click.forEach(fn => fn({}));
check('…and no-ops with a message when nothing is locked',
      dom.logs.some(l => /No layer is locked/.test(l)));

const panel = dom.els.get('layers');
chip.listeners.click.forEach(fn => fn({}));
check('clicking the chip opens the panel', panel.classList.contains('open'));
chip.listeners.click.forEach(fn => fn({}));
check('…and clicking it again closes it', !panel.classList.contains('open'));

const html = await (await import('node:fs')).promises.readFile(
  new URL('../index.html', import.meta.url), 'utf8');
for (const gone of ['id="layerSel"', 'id="btnLayerOff"', 'id="btnLayerLock"', 'id="btnLayerPanel"'])
  check(`the bar no longer carries ${gone} — the panel owns it`, !html.includes(gone));
check('the bar keeps the current-layer chip, its colour and +',
      html.includes('id="layerCur"') && html.includes('id="layerColor"') && html.includes('id="btnAddLayer"'));

finish();
