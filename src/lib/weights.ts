/** Criteria weights are whole percentages that always sum to 100 (when there is at least one criterion). */
export type Weights = Record<string, number>

/** Base criteria: equal weights. defensive_contribution is only included when the API provides it. */
export const baseCriteria = (hasDefCon: boolean): Weights =>
  equalWeights(['goals_scored', 'assists', 'total_points', 'clean_sheets', ...(hasDefCon ? ['defensive_contribution'] : [])])

/** Largest-remainder rounding of non-negative `raw` values to integers summing to `total`. */
function distribute(raw: number[], total: number): number[] {
  const floors = raw.map(Math.floor)
  let left = total - floors.reduce((a, b) => a + b, 0)
  const order = raw.map((v, i) => ({ i, r: v - Math.floor(v) })).sort((a, b) => b.r - a.r)
  for (const { i } of order) { if (left <= 0) break; floors[i]++; left-- }
  return floors
}

export function equalWeights(keys: string[]): Weights {
  if (!keys.length) return {}
  const vals = distribute(keys.map(() => 100 / keys.length), 100)
  return Object.fromEntries(keys.map((k, i) => [k, vals[i]]))
}

/** Give `key` a new weight (clamped 0-100) and rescale the other criteria proportionally so the total stays 100. */
export function setWeight(w: Weights, key: string, value: number): Weights {
  const v = Math.min(100, Math.max(0, Math.round(value)))
  const others = Object.keys(w).filter((k) => k !== key)
  if (!others.length) return { ...w, [key]: 100 }
  const target = 100 - v, sum = others.reduce((a, k) => a + w[k], 0)
  const raw = others.map((k) => (sum > 0 ? (w[k] * target) / sum : target / others.length))
  const vals = distribute(raw, target)
  return { ...w, [key]: v, ...Object.fromEntries(others.map((k, i) => [k, vals[i]])) }
}

/** Add a criterion with an equal share (100 / n); the existing ones shrink proportionally. */
export function addCriterion(w: Weights, key: string): Weights {
  if (key in w) return w
  const n = Object.keys(w).length + 1
  return setWeight({ ...w, [key]: 0 }, key, Math.round(100 / n))
}

/** Remove a criterion and hand its weight to the rest proportionally. */
export function removeCriterion(w: Weights, key: string): Weights {
  const rest = Object.keys(w).filter((k) => k !== key)
  if (!rest.length) return {}
  const sum = rest.reduce((a, k) => a + w[k], 0)
  const vals = distribute(rest.map((k) => (sum > 0 ? (w[k] * 100) / sum : 100 / rest.length)), 100)
  return Object.fromEntries(rest.map((k, i) => [k, vals[i]]))
}

export const totalWeight = (w: Weights) => Object.values(w).reduce((a, b) => a + b, 0)
