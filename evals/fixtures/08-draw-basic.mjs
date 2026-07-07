// basic generation on an empty board
export default {
  name: 'draw-basic-rect',
  doc: { units: 'cm', layers: [{ name: '0', color: '#e8e8e8' }], idSeq: 1, entities: [] },
  request: 'draw a rectangle 200 wide and 100 tall with its bottom-left corner at the origin',
  expect: { status: 'ok', asserts: [
    { kind: 'count', where: { type: 'pline' }, equals: 1 },
    { kind: 'bbox', where: { type: 'pline' }, box: [0, 0, 200, 100] },
  ]},
}
