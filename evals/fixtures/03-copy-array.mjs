// array-style COPY: one clone per displacement
export default {
  name: 'copy-array',
  doc: {
    units: 'cm', layers: [{ name: '0', color: '#e8e8e8' }], idSeq: 2,
    entities: [{ id: 1, type: 'circle', layer: '0', cx: 0, cy: 0, r: 20 }],
  },
  request: 'make a row of four of these circles in total, spaced 100 apart to the right',
  expect: { status: 'ok', asserts: [
    { kind: 'count', where: { type: 'circle' }, equals: 4 },
    { kind: 'entity', where: { type: 'circle' }, props: { cx: 100, cy: 0, r: 20 } },
    { kind: 'entity', where: { type: 'circle' }, props: { cx: 200, cy: 0, r: 20 } },
    { kind: 'entity', where: { type: 'circle' }, props: { cx: 300, cy: 0, r: 20 } },
  ]},
}
