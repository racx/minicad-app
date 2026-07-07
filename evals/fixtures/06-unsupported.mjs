// unsupported feature (no blocks/symbols) → clarify explaining, not garbage
export default {
  name: 'unsupported-bathtub',
  doc: {
    units: 'cm', layers: [{ name: '0', color: '#e8e8e8' }], idSeq: 2,
    entities: [{ id: 1, type: 'pline', layer: '0', closed: true,
                 pts: [{x:0,y:0},{x:250,y:0},{x:250,y:200},{x:0,y:200}] }],
  },
  request: 'insert a bathtub symbol from the fixtures library',
  expect: { status: 'clarify', asserts: [{ kind: 'untouched' }] },
}
