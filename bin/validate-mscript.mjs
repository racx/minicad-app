#!/usr/bin/env node
/* Engine-true MScript validation for the AI service: loads a drawing doc,
   previewScript()s the candidate (execute + full rollback — nothing sticks),
   and reports line-numbered errors. stdin: {doc, script} → stdout:
   {errors:[{line,msg}], entities:<would-be count>} */
import { readFileSync } from 'node:fs'
import { createEngine } from '@minicad/engine'

const { doc = {}, script = '' } = JSON.parse(readFileSync(0, 'utf8'))
const engine = createEngine()
const S = engine.state

if (Array.isArray(doc.layers) && doc.layers.length) S.setLayers(doc.layers)
S.setEntities(Array.isArray(doc.entities) ? doc.entities : [])
S.setIdSeq(doc.idSeq || (S.entities.length + 1))
S.setUnits(doc.units || 'cm')
S.setCurrentLayer(S.layers[0].name)

const r = engine.previewScript(script)
console.log(JSON.stringify({ errors: r.errors, entities: r.entities.length }))
