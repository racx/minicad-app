// deliberately ambiguous magnitude — clarify is the right answer; a guessed
// small move is a FAIL we want to see (failures are data)
export default {
  name: 'ambiguous-direction',
  doc: {
    units: 'cm', layers: [{ name: '0', color: '#e8e8e8' }, { name: 'furniture', color: '#f2b950' }], idSeq: 2,
    entities: [{ id: 1, type: 'pline', layer: 'furniture', closed: true,
                 pts: [{x:180,y:330},{x:330,y:330},{x:330,y:405},{x:180,y:405}] }],
  },
  request: 'move the sofa a bit to the left',
  expect: { status: 'clarify', asserts: [{ kind: 'untouched' }] },
}
