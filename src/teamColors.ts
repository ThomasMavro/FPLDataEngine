import type { Team } from './fpl'

const C: Record<string, [string, string]> = {
  ARS: ['#ef0107', '#ffffff'], AVL: ['#670e36', '#95bfe5'], BOU: ['#da291c', '#000000'], BRE: ['#e30613', '#ffffff'],
  BHA: ['#0057b8', '#ffffff'], BUR: ['#6c1d45', '#99d6ea'], CHE: ['#034694', '#ffffff'], CRY: ['#1b458f', '#c4122e'],
  EVE: ['#003399', '#ffffff'], FUL: ['#ffffff', '#000000'], IPS: ['#3a64a3', '#ffffff'], LEE: ['#ffffff', '#1d428a'],
  LEI: ['#003090', '#fdbe11'], LIV: ['#c8102e', '#ffffff'], MCI: ['#6cabdd', '#ffffff'], MUN: ['#da291c', '#fbe122'],
  NEW: ['#241f20', '#ffffff'], NFO: ['#dd0000', '#ffffff'], SOU: ['#d71920', '#ffffff'], SUN: ['#eb172b', '#ffffff'],
  TOT: ['#ffffff', '#132257'], WHU: ['#7a263a', '#1bb1e7'], WOL: ['#fdb913', '#231f20'],
}
/** [shirt, trim] colours for a club; deterministic fallback for clubs not listed. */
export function teamColors(t?: Team): [string, string] {
  if (!t) return ['#888', '#fff']
  return C[t.short_name] ?? [`hsl(${(t.code * 47) % 360} 55% 40%)`, '#ffffff']
}
