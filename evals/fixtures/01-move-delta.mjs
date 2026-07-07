// computed-delta MOVE: the model must subtract coordinates, not echo a destination
export default {
  name: 'move-delta',
  doc: {
    units: 'cm',
    layers: [{ name: '0', color: '#e8e8e8' }, { name: 'furniture', color: '#f2b950' }],
    idSeq: 3,
    entities: [
      { id: 1, type: 'pline', layer: '0', closed: true, pts: [{x:0,y:0},{x:830,y:0},{x:830,y:430},{x:0,y:430}] },
      { id: 2, type: 'pline', layer: 'furniture', closed: true, pts: [{x:15,y:115},{x:75,y:115},{x:75,y:415},{x:15,y:415}] },
    ],
  },
  request: 'move the kitchen counter 20 to the right',
  expect: { status: 'ok', asserts: [
    { kind: 'moved', id: 2, dx: 20, dy: 0 },
    { kind: 'unchanged', id: 1 },
  ]},
}
