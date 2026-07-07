/* MScript validation (shell-side) — parses the AI's line-oriented script into
   engine entity shapes WITHOUT executing anything. Grammar per the engine's
   docs/ai-commands-design.md (v1 draw subset); the engine repo stays untouched.
   parse(text) → { entities: [engine-shaped, no id/layer], errors: [{line, msg}] } */

const NUM = String.raw`-?\d+(?:\.\d+)?`
const PT  = String.raw`(${NUM})\s*,\s*(${NUM})`

export function parseMScript(text) {
  const entities = []
  const errors = []
  const lines = String(text || '').split('\n')

  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const err = msg => errors.push({ line: i + 1, msg })

    let m
    if ((m = line.match(new RegExp(`^RECT\\s+${PT}\\s+${PT}$`, 'i')))) {
      const [x1, y1, x2, y2] = m.slice(1, 5).map(Number)
      if (x1 === x2 || y1 === y2) return err('RECT corners must span a real rectangle')
      entities.push({ type: 'pline', closed: true,
        pts: [ { x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 } ] })
    }
    else if ((m = line.match(new RegExp(`^LINE((?:\\s+${PT}){2,})$`, 'i')))) {
      const nums = m[1].trim().split(/[\s,]+/).map(Number)
      for (let j = 0; j + 3 < nums.length; j += 2)
        entities.push({ type: 'line', x1: nums[j], y1: nums[j + 1], x2: nums[j + 2], y2: nums[j + 3] })
    }
    else if ((m = line.match(new RegExp(`^CIRCLE\\s+${PT}\\s+r(${NUM})$`, 'i')))) {
      const [cx, cy, r] = m.slice(1, 4).map(Number)
      if (!(r > 0)) return err('CIRCLE radius must be positive')
      entities.push({ type: 'circle', cx, cy, r })
    }
    else if ((m = line.match(new RegExp(`^PLINE((?:\\s+${PT}){2,})(\\s+CLOSE)?$`, 'i')))) {
      const nums = m[1].trim().split(/[\s,]+/).map(Number)
      const pts = []
      for (let j = 0; j + 1 < nums.length; j += 2) pts.push({ x: nums[j], y: nums[j + 1] })
      entities.push({ type: 'pline', closed: !!m[m.length - 1], pts })
    }
    else {
      err(`can't interpret "${line.slice(0, 40)}"`)
    }
  })

  if (!errors.length && !entities.length) errors.push({ line: 0, msg: 'script draws nothing' })
  return { entities, errors }
}
