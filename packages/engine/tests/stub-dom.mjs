/* =========================================================
   MiniCAD test harness — minimal DOM stub for Node.
   Installs global document/window, returns event helpers.
   Import this BEFORE importing ../js/main.js.
   ========================================================= */
export function setupDOM(){
  function makeCtx(){
    return new Proxy({}, {
      get(t,p){ if (p in t) return t[p]; return ()=>{}; },
      set(t,p,v){ t[p]=v; return true; }
    });
  }
  function makeEl(){
    const el = {
      style:{}, dataset:{}, children:[], value:'', textContent:'', innerHTML:'', listeners:{},
      classList:{ toggle(){}, add(){}, remove(){} },
      addEventListener(type,fn){ (el.listeners[type] ||= []).push(fn); },
      appendChild(c){ el.children.push(c); return c; },
      removeChild(){},
      get firstChild(){ return el.children[0]; },
      scrollTop:0, scrollHeight:0,
      focus(){}, click(){},
      getBoundingClientRect(){ return {width:800, height:600, left:0, top:0}; },
      getContext(){ return makeCtx(); },
    };
    return el;
  }
  const els = new Map();
  globalThis.document = {
    getElementById(id){ if (!els.has(id)) els.set(id, makeEl()); return els.get(id); },
    createElement(){ return makeEl(); },
    querySelectorAll(){ return []; },
    activeElement: null,
  };
  const winListeners = {};
  globalThis.window = { devicePixelRatio:1, addEventListener(t,f){ (winListeners[t] ||= []).push(f); } };
  globalThis.prompt = ()=>null;
  if (typeof globalThis.localStorage === 'undefined'){
    const store = new Map();
    globalThis.localStorage = {
      getItem: k => store.has(k) ? store.get(k) : null,
      setItem: (k,v)=>store.set(k, String(v)),
      removeItem: k => store.delete(k),
      clear: ()=>store.clear(),
    };
  }

  const logs = [];
  document.getElementById('history').appendChild = d => { logs.push(d.textContent); };
  const cv = document.getElementById('cv');

  return {
    els, logs, cv,
    promptEl: document.getElementById('prompt'),
    // dispatch a canvas event / a window event
    fire:   (type, ev)=>cv.listeners[type]?.forEach(fn=>fn({preventDefault(){}, ...ev})),
    fireWin:(type, ev)=>(winListeners[type]||[]).forEach(fn=>fn({preventDefault(){}, key:'', ...ev})),
    // capture the next download's contents (Save / Export DXF)
    captureDownload(){
      const box = {data:null};
      globalThis.Blob = class { constructor(parts){ box.data = parts.join(''); } };
      globalThis.URL = { createObjectURL(){ return 'blob:x'; }, revokeObjectURL(){} };
      return box;
    },
  };
}

/* shared assertion helpers */
let fails = 0;
export const check = (name, cond)=>{ console.log((cond?'PASS':'FAIL')+'  '+name); if (!cond) fails++; };
export const near = (a,b,eps=1e-6)=>Math.abs(a-b)<eps;
export function finish(){
  console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
}
