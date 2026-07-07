// TRIM with a pick point: cut the right piece of the horizontal line
export default {
  name: 'trim-pick',
  doc: {
    units: 'cm', layers: [{ name: '0', color: '#e8e8e8' }], idSeq: 3,
    entities: [
      { id: 1, type: 'line', layer: '0', x1: 0, y1: 50, x2: 300, y2: 50 },
      { id: 2, type: 'line', layer: '0', x1: 180, y1: 0, x2: 180, y2: 120 },
    ],
  },
  request: 'cut away the part of the horizontal line to the right of the vertical line',
  expect: { status: 'ok', asserts: [
    { kind: 'entity', where: { type: 'line' }, props: { x1: 0, y1: 50, x2: 180, y2: 50 } },
    { kind: 'noEntity', where: { type: 'line' }, props: { x2: 300, y2: 50 } },
  ]},
}
