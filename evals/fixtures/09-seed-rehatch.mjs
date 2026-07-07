// floor-plan scale: the seeded studio (76 entities), swap the bathroom hatch
export default {
  name: 'seed-studio-rehatch',
  seedScript: 'db/seeds/drawings/01-studio-apartment.mscript',
  request: 'hatch the bathroom as wood instead',
  expect: { status: 'ok', asserts: [
    // the bath region is the ~84000 cm² one; its hatch must end up wood
    { kind: 'hatchByArea', areaAbout: 84000, material: 'wood' },
    // the living-room hatch stays wood too but must not disappear
    { kind: 'hatchByArea', areaAbout: 232000, material: 'wood' },
  ]},
}
