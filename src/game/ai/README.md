# AI

Computer players. Rules and behaviour are described in [wiki/AI.md](../../../wiki/AI.md). One concept per file; the file
name is the function, type or pattern it holds.

| Folder | Holds |
|---|---|
| `planner/` | Entry points (`plan-ai-actions.ts`, `plan-ai-actions-steps.ts`), the pattern list, the fallback `best-available-action.ts` and, in `candidates/`, one scored-option generator per concern (upgrades, spawns, units, food, buildings, roads, skills, ...) |
| `patterns/` | Tactics tried in priority order, one file per pattern, grouped by `offense/`, `defense/`, `growth/`, `naval/`, `raid/`, `unit-role/`; `all-patterns.ts` lists them |
| `situation/` | Read-only queries on the board: `analyze-situation.ts`, enemy reach, distances, naval threats, idle units, reachable cells |
| `strategy/` | Long-lived goals and the directives derived from them |
| `military/` | Group attacks (`plan-gang-attack.ts`), garrison guard, squad operation, lightning target |
| `defense/` | Garrison reserve and tower placement |
| `economy/` | Food and storage planning (`food/`), mines, ports, network links, opening build order, trade, skill order |
| `spawn/` | Which unit to raise, whether it would survive, who holds a village |
| `unit-roles/` | Support-unit and special-unit rules |
| `review/` | Vetoes of unsafe steps (lookahead, season, weather) |
| `config/` | Flags, difficulty profiles, personalities, tuning constants |
| `types/` | `AiAction`, planner state, directives, goals, operation |
| `util/` | Small shared helpers |
