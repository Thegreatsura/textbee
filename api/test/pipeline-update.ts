// Reads a pipeline update back for assertions: the literal values its $set
// stages write, the fields it unsets, and the entries it appends to the trail.
export function readPipelineUpdate(update: any) {
  if (!Array.isArray(update)) throw new Error('expected a pipeline update')
  const set: Record<string, any> = {}
  const unset: string[] = []
  let history: any[] = []
  for (const stage of update) {
    if (stage.$unset) unset.push(...[].concat(stage.$unset))
    if (!stage.$set) continue
    for (const [key, value] of Object.entries<any>(stage.$set)) {
      if (key === 'errorHistory') {
        history = value.$let.vars.all.$sortArray.input.$concatArrays[1].$literal
      } else if (key !== 'metadata.errorHistory') {
        set[key] = value && typeof value === 'object' && '$literal' in value ? value.$literal : value
      }
    }
  }
  return { set, unset, history }
}
