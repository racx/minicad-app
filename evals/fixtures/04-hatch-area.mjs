// HATCH with an area-aware request on a closed room
export default {
  name: 'hatch-room',
  doc: {
    units: 'cm', layers: [{ name: '0', color: '#e8e8e8' }], idSeq: 2,
    entities: [{ id: 1, type: 'pline', layer: '0', closed: true,
                 pts: [{x:0,y:0},{x:400,y:0},{x:400,y:300},{x:0,y:300}] }],
  },
  request: 'hatch this room as wood flooring',
  expect: { status: 'ok', asserts: [
    { kind: 'hatch', material: 'wood', ref: 1 },
  ]},
}
