// floor-plan scale: find the right entity among 76 and compute the delta
export default {
  name: 'seed-studio-move-counter',
  seedScript: 'db/seeds/drawings/01-studio-apartment.mscript',
  request: 'move the kitchen counter 20 to the right',
  expect: { status: 'ok', asserts: [
    // the counter is the 60×300 furniture pline at x15..75 y115..415
    { kind: 'entity', where: { type: 'pline', layer: 'furniture' },
      bboxIs: [35, 115, 95, 415] },
  ]},
}
