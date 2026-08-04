/* =========================================================
   MiniCAD — symbol library picker (INSERT)

   Typing a name works and always will, but nobody knows the names on their
   first day. INSERT opens this; picking one goes straight to "where?".
   ========================================================= */
import { SYMBOLS } from '../../core/symbols.js';
import { registerSymbolDialog, chooseSymbol, cancelCmd } from '../../core/commands.js';

const $ = id => document.getElementById(id);
const dlg = $('symbolDlg');

function build(){
  const box = $('symbolList');
  const groups = new Map();
  for (const [key, s] of Object.entries(SYMBOLS)){
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push([key, s]);
  }
  for (const [group, items] of groups){
    const h = document.createElement('h3');
    h.textContent = group;
    box.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const [key, s] of items){
      const b = document.createElement('button');
      b.className = 'btn';
      b.type = 'button';
      b.textContent = s.label;                 // a label is data, never markup
      b.title = `INSERT ${key}`;
      b.addEventListener('click', ()=>{ close(); chooseSymbol(key); });
      grid.appendChild(b);
    }
    box.appendChild(grid);
  }
}

export function open(){ dlg.classList.add('open'); }
export function close(){ dlg.classList.remove('open'); }

build();
$('symbolCancel').addEventListener('click', ()=>{ close(); cancelCmd(); });
registerSymbolDialog(open);
