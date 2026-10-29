// TEST DATA ONLY: hand-written, fictional values in the shape of the FPL API. Never imported by the UI.
import type { Bootstrap, Element, HistoryRow } from '../fpl'

const teamNames = ['ARS','AVL','BOU','BRE','BHA','CHE','CRY','EVE','FUL','IPS','LEI','LIV','MCI','MUN','NEW','NFO','SOU','TOT','WHU','WOL']
export const teams = teamNames.map((s, i) => ({ id: i + 1, name: `Test ${s}`, short_name: s, code: i + 100 }))

// [id, name, team, pos, cost(x10), total_points, minutes, goals, assists]
const rows: [number, string, number, number, number, number, number, number, number][] = [
  [1, 'Keeper A', 1, 1, 55, 80, 900, 0, 0], [2, 'Keeper B', 2, 1, 45, 60, 900, 0, 0], [3, 'Keeper C', 3, 1, 40, 40, 900, 0, 0],
  [4, 'Keeper D', 4, 1, 40, 20, 90, 0, 0],
  [5, 'Def A', 1, 2, 60, 70, 900, 1, 3], [6, 'Def B', 1, 2, 55, 65, 900, 2, 1], [7, 'Def C', 1, 2, 50, 60, 900, 0, 2],
  [8, 'Def D', 1, 2, 50, 58, 900, 0, 0], [9, 'Def E', 2, 2, 45, 50, 800, 0, 1], [10, 'Def F', 3, 2, 45, 45, 800, 1, 0],
  [11, 'Def G', 4, 2, 40, 40, 800, 0, 0], [12, 'Def H', 5, 2, 40, 30, 600, 0, 0], [13, 'Def I', 6, 2, 40, 28, 600, 0, 0],
  [14, 'Mid A', 12, 3, 130, 150, 900, 8, 6], [15, 'Mid B', 13, 3, 105, 110, 900, 5, 5], [16, 'Mid C', 14, 3, 80, 90, 900, 4, 3],
  [17, 'Mid D', 15, 3, 65, 75, 850, 3, 2], [18, 'Mid E', 16, 3, 60, 60, 800, 2, 2], [19, 'Mid F', 17, 3, 55, 50, 800, 1, 3],
  [20, 'Mid G', 18, 3, 50, 45, 700, 1, 1], [21, 'Mid H', 19, 3, 45, 40, 700, 1, 0], [22, 'Mid I', 20, 3, 45, 20, 400, 0, 0],
  [23, 'Fwd A', 13, 4, 145, 140, 900, 10, 2], [24, 'Fwd B', 12, 4, 85, 95, 900, 6, 1], [25, 'Fwd C', 9, 4, 70, 70, 850, 5, 1],
  [26, 'Fwd D', 10, 4, 55, 50, 800, 3, 0], [27, 'Fwd E', 11, 4, 45, 30, 600, 2, 0], [28, 'Fwd F', 7, 4, 45, 10, 100, 0, 0],
]
export const elements: Element[] = rows.map(([id, web_name, team, element_type, now_cost, total_points, minutes, goals_scored, assists]) => ({
  id, web_name, team, element_type, now_cost, total_points, minutes, goals_scored, assists,
  status: 'a', news: '', form: String(total_points / 10), points_per_game: String((total_points / (minutes / 90 || 1)).toFixed(1)),
  selected_by_percent: '10.0', event_points: 2, clean_sheets: 3, goals_conceded: 8, own_goals: 0, penalties_saved: 0,
  penalties_missed: 0, yellow_cards: 1, red_cards: 0, saves: element_type === 1 ? 30 : 0, bonus: 5, bps: 200,
  influence: '300.0', creativity: '200.0', threat: '150.0', ict_index: '65.0',
  expected_goals: String(goals_scored * 0.9), expected_assists: String(assists * 0.9), expected_goal_involvements: '3.0',
  expected_goals_conceded: '9.0', expected_goals_per_90: goals_scored * 0.09, expected_assists_per_90: 0.1,
  expected_goal_involvements_per_90: 0.3, expected_goals_conceded_per_90: 1, saves_per_90: 3, clean_sheets_per_90: 0.3,
  goals_conceded_per_90: 0.8, defensive_contribution: 10, transfers_in_event: 1000, transfers_out_event: 500,
}))

export const bootstrap: Bootstrap = {
  elements, teams,
  element_types: [{ id: 1, singular_name_short: 'GKP' }, { id: 2, singular_name_short: 'DEF' }, { id: 3, singular_name_short: 'MID' }, { id: 4, singular_name_short: 'FWD' }],
  events: [{ id: 1, name: 'Gameweek 1', finished: true, is_current: false }, { id: 2, name: 'Gameweek 2', finished: true, is_current: false }, { id: 3, name: 'Gameweek 3', finished: false, is_current: true }],
}

export const fixtures = [
  { id: 1, event: 3, team_h: 1, team_a: 2, finished: false },
  { id: 2, event: 3, team_h: 3, team_a: 4, finished: false },
  { id: 3, event: 2, team_h: 2, team_a: 1, finished: true },
]

export const history: HistoryRow[] = [
  { round: 1, was_home: true, minutes: 90, total_points: 10, goals_scored: 2, expected_goals: '1.5', saves: 0 },
  { round: 2, was_home: false, minutes: 90, total_points: 2, goals_scored: 0, expected_goals: '0.3', saves: 0 },
  { round: 3, was_home: true, minutes: 0, total_points: 0, goals_scored: 0, expected_goals: '0.0', saves: 0 },
]
