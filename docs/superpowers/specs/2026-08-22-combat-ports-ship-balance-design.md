# Combat, Ports, and Ship Balance Design

Date: 2026-08-22

## Problem

Four related naval/combat changes:

1. A land unit should be able to attack a ship on water.
2. When any unit sinks a ship, the attacker must not move onto the killed ship's tile.
3. A unit cannot use an enemy's port (only owned-or-free ports grant ship ability).
4. Ports render in the owning tribe's color instead of a fixed orange.

## Design

### 1. Land units can attack ships on water (`src/game/combat.ts`)

In `attackableTargets`, delete the restriction:

```ts
if (t.terrain === TileType.Water && !isShip(unit)) return false;
```

After removal, any unit within `shipAttackDistance(unit)` can target an enemy unit on any
tile (land or water). `isShip` import is still used by the killed-ship check below.

### 2. Killed ship: attacker does not move onto it (`src/game/combat.ts` `performAttack`)

Current move-on-kill logic uses a terrain check:

```ts
if (attackerTile && attacker.type !== 'archer' && !isShip(attacker) && target.terrain !== TileType.Water) {
  attackerTile.unit = null;
  attacker.q = target.q;
  attacker.r = target.r;
  target.unit = attacker;
}
```

Change the guard to be explicit about the killed unit being a ship. Capture the target unit
before mutation (`const targetUnit = target.unit!` is already at the top of `performAttack`).
Replace `target.terrain !== TileType.Water` with `!isShip(targetUnit)`:

```ts
if (attackerTile && attacker.type !== 'archer' && !isShip(attacker) && !isShip(targetUnit)) {
  attackerTile.unit = null;
  attacker.q = target.q;
  attacker.r = target.r;
  target.unit = attacker;
}
```

This keeps land-vs-land move-on-kill (non-archer) intact, while any kill of a ship (by land
or by ship) leaves the attacker in place.

### 3. Enemy ports unusable (`src/game/buildings.ts` + `src/game/simulator.ts`)

Add to `buildings.ts`:

```ts
export function canUsePort(tile: MapTile, player: Player): boolean {
  return tile.building?.kind === 'port' && (tile.ownedBy === null || tile.ownedBy === player.index);
}
```

In `simulator.ts` `doMove`, replace the port grant condition:

```ts
if (canUsePort(target, player)) {
  gainShipAbility(unit);
}
```

Import `canUsePort` in `simulator.ts`.

### 4. Port texture per tribe (`src/render/textureFactory.ts` + `src/render/mapRenderer.ts`)

- In `TextureSet`, replace `portTexture: Texture` with `portTextures: Record<Tribe, Texture>`.
- Change `makePortTexture(app, hexSize)` to `makePortTexture(app, color, hexSize)` and use the
  passed color instead of hardcoded `0xe07830`.
- In `createTextures`, build one per tribe:

```ts
const portTextures = {} as Record<Tribe, Texture>;
for (const tribe of TRIBES) {
  portTextures[tribe.id] = makePortTexture(app, tribe.color, hexSize);
}
```

- In `mapRenderer.ts` `applyTile`, select the port texture by the tile's owner:

```ts
this.syncSprite(tv, 'buildingSprite', tile.building
  ? tile.building.kind === 'port'
    ? tile.ownedBy === null
      ? this.textures.portTextures.fallback
      : this.textures.portTextures[players[tile.ownedBy].tribe]
    : tile.building.kind === 'factory'
      ? this.textures.factoryTexture
      : this.textures.mineTexture
  : null, p.x, y);
```

For `tile.ownedBy === null` ports, use a neutral gray port texture. Add it to `TextureSet`
as `freePortTexture` (gray) alongside `portTextures`. (`TRIBES` is already imported in
`textureFactory.ts`; `players`/`tile.ownedBy` are already available in `applyTile`.)

## Files touched

- `src/game/combat.ts`
- `src/game/buildings.ts`
- `src/game/simulator.ts`
- `src/render/textureFactory.ts`
- `src/render/mapRenderer.ts`
- `tests/combat.test.ts`, `tests/ship.test.ts`

## Testing

- `attackableTargets` allows a land unit to target a ship on water; a ship can still target
  land units and other ships.
- `performAttack`: killing a ship does not move the attacker onto the water tile (land and
  ship attackers); killing a land unit still moves a non-archer land attacker.
- `canUsePort` returns false for enemy-owned ports, true for owned and free ports.
- Existing suite + typecheck pass.
