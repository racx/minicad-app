// ambiguity → ONE question, nothing drawn
export default {
  name: 'clarify-ambiguous-target',
  doc: {
    units: 'cm', layers: [{ name: '0', color: '#e8e8e8' }], idSeq: 3,
    entities: [
      { id: 1, type: 'circle', layer: '0', cx: 100, cy: 100, r: 40 },
      { id: 2, type: 'pline', layer: '0', closed: true, pts: [{x:200,y:0},{x:300,y:0},{x:300,y:80},{x:200,y:80}] },
    ],
  },
  request: 'make it bigger',
  expect: { status: 'clarify', asserts: [{ kind: 'untouched' }] },
}
