// "the selected X" must resolve through the context's selection array
export default {
  name: 'selection-reference',
  doc: {
    units: 'cm',
    layers: [{ name: '0', color: '#e8e8e8' }, { name: 'furniture', color: '#f2b950' }],
    idSeq: 4,
    entities: [
      { id: 1, type: 'pline', layer: '0', closed: true, pts: [{x:-600,y:-500},{x:400,y:-500},{x:400,y:500},{x:-600,y:500}] },
      { id: 2, type: 'pline', layer: 'furniture', closed: true, pts: [{x:700,y:-300},{x:1200,y:-300},{x:1200,y:200},{x:700,y:200}] },
      { id: 3, type: 'circle', layer: '0', cx: 0, cy: 0, r: 80 },
    ],
  },
  selection: [2],
  request: 'hatch the selected square as concrete',
  expect: { status: 'ok', asserts: [
    { kind: 'hatch', material: 'concrete', ref: 2 },
  ]},
}
