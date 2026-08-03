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
      style:{}, dataset:{}, children:[], value:'', textContent:'', listeners:{},
      // real elements drop their children when innerHTML is assigned; code that
      // rebuilds a list relies on that, so the stub has to honour it
      _html:'',
      get innerHTML(){ return el._html + el.children.map(c=>c.innerHTML||c.textContent||'').join(''); },
      set innerHTML(v){ el._html = v; if (v === '') el.children.length = 0; },
      classList:{ toggle(){}, add(){}, remove(){} },
      addEventListener(type,fn){ (el.listeners[type] ||= []).push(fn); },
      appendChild(c){ el.children.push(c); return c; },
      removeChild(){},
      get firstChild(){ return el.children[0]; },
      scrollTop:0, scrollHeight:0,
      attrs:{},
      setAttribute(k,v){ el.attrs[k]=String(v); },
      removeAttribute(k){ delete el.attrs[k]; },
      getAttribute(k){ return k in el.attrs ? el.attrs[k] : null; },
      hasAttribute(k){ return k in el.attrs; },
      focus(){ el.listeners.focus?.forEach(fn=>fn({})); },
      blur(){ el.listeners.blur?.forEach(fn=>fn({})); },
      click(){},
      getBoundingClientRect(){ return {width:800, height:600, left:0, top:0}; },
      getContext(){ return makeCtx(); },
    };
    return el;
  }
  const els = new Map();
  globalThis.document = {
    getElementById(id){ if (!els.has(id)) els.set(id, makeEl()); return els.get(id); },
    createElement(){ return makeEl(); },
    querySelector(){ return null; },      // no csrf meta tag in the stub
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

  // File / FileReader: fakeFile()/fakeBinFile() below make the objects the
  // open* helpers expect.
  globalThis.FileReader = class {
    readAsText(f){ this.result = f && f._text || ''; this.onload && this.onload(); }
    readAsArrayBuffer(f){
      const b = f && f._bytes || new Uint8Array(0);
      this.result = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      this.onload && this.onload();
    }
  };

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

/* a File as far as openJSON/openDXF are concerned */
export const fakeFile = (name, text)=>({name, _text:text});

/* a binary File (openDWG reads bytes, not text) */
export const fakeBinFile = (name, bytes)=>({name, _bytes:bytes});

/* raw bytes that pass the "AC" + 4 digits DWG version stamp */
export const dwgBytes = (ver='AC1018', pad=64)=>{
  const b = new Uint8Array(ver.length + pad);
  for (let i=0;i<ver.length;i++) b[i] = ver.charCodeAt(i);
  return b;
};

/* Install a fake fetch. `handler(url, opts)` returns {status, body} —
   body a string, or an object which is sent as JSON. */
export function stubFetch(handler){
  const calls = [];
  globalThis.fetch = async (url, opts)=>{
    calls.push({url, opts});
    const r = await handler(url, opts);
    if (r && r.networkError) throw new Error('network down');
    const {status=200, body=''} = r || {};
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return {
      ok: status>=200 && status<300,
      status,
      async text(){ return text; },
      async json(){ return JSON.parse(text); },
    };
  };
  return calls;
}

/* shared assertion helpers */
let fails = 0;
export const check = (name, cond)=>{ console.log((cond?'PASS':'FAIL')+'  '+name); if (!cond) fails++; };
export const near = (a,b,eps=1e-6)=>Math.abs(a-b)<eps;
export function finish(){
  console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
}
