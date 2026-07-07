// the live failure from 2026-07-07: genuinely ambiguous phrasing — the model
// must ASK, not burn retries on invalid scripts and give up
export default {
  name: 'ambiguous-trim-phrase',
  doc: {
    units: 'cm',
    layers: [{ name: '0', color: '#e8e8e8' }, { name: 'furniture', color: '#f2b950' }],
    idSeq: 3,
    entities: [
      { id: 1, type: 'pline', layer: '0', closed: true, pts: [{x:-600,y:-500},{x:400,y:-500},{x:400,y:500},{x:-600,y:500}] },
      { id: 2, type: 'pline', layer: 'furniture', closed: true, pts: [{x:700,y:-300},{x:1200,y:-300},{x:1200,y:200},{x:700,y:200}] },
    ],
  },
  selection: [2],
  request: 'trim a 90cm line on the right side of the selected square',
  expect: { status: 'clarify', asserts: [{ kind: 'untouched' }] },
}
