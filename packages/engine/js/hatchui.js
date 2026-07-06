/* =========================================================
   MiniCAD — HATCH dialog wiring (material catalog picker)
   ========================================================= */
import { MATERIALS } from './materials.js';
import { registerHatchDialog, chooseHatchMaterial, cancelCmd } from './commands.js';

const $ = id => document.getElementById(id);
const dlg = $('hatchDlg');

function buildRows(){
  const box = $('hatchMats');
  for (const m of MATERIALS){
    const b = document.createElement('button');
    b.className = 'btn hatch-mat';
    b.type = 'button';
    const sw = document.createElement('span');
    sw.className = 'sw';
    sw.style.background = m.color;
    b.appendChild(sw);
    const label = document.createElement('span');
    label.textContent = m.name;
    b.appendChild(label);
    b.addEventListener('click', ()=>{ closeHatch(); chooseHatchMaterial(m.key); });
    box.appendChild(b);
  }
}

export function openHatch(){ dlg.style.display = 'block'; }
export function closeHatch(){ dlg.style.display = 'none'; }

buildRows();
$('hatchCancel').addEventListener('click', ()=>{ closeHatch(); cancelCmd(); });
registerHatchDialog(openHatch);
