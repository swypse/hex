import { t } from '../i18n';
export enum TileType {
  GrasslandLand,
  GrasslandForest,
  GrasslandMountain,
  DesertLand,
  DesertForest,
  DesertMountain,
  TundraLand,
  TundraForest,
  TundraMountain,
  TaigaLand,
  TaigaForest,
  TaigaMountain,
  RainforestLand,
  RainforestForest,
  RainforestMountain,
  Water,
  Settlement,
}

export const ALL_TILE_TYPES: TileType[] = [
  TileType.GrasslandLand,
  TileType.GrasslandForest,
  TileType.GrasslandMountain,
  TileType.DesertLand,
  TileType.DesertForest,
  TileType.DesertMountain,
  TileType.TundraLand,
  TileType.TundraForest,
  TileType.TundraMountain,
  TileType.TaigaLand,
  TileType.TaigaForest,
  TileType.TaigaMountain,
  TileType.RainforestLand,
  TileType.RainforestForest,
  TileType.RainforestMountain,
  TileType.Water,
  TileType.Settlement,
];

const LAND_TYPES = [
  TileType.GrasslandLand,
  TileType.DesertLand,
  TileType.TundraLand,
  TileType.TaigaLand,
  TileType.RainforestLand,
];
const FOREST_TYPES = [
  TileType.GrasslandForest,
  TileType.DesertForest,
  TileType.TundraForest,
  TileType.TaigaForest,
  TileType.RainforestForest,
];
const MOUNTAIN_TYPES = [
  TileType.GrasslandMountain,
  TileType.DesertMountain,
  TileType.TundraMountain,
  TileType.TaigaMountain,
  TileType.RainforestMountain,
];

export function isLandType(t: TileType): boolean {
  return LAND_TYPES.includes(t);
}

export function isForestType(t: TileType): boolean {
  return FOREST_TYPES.includes(t);
}

export function isMountainType(t: TileType): boolean {
  return MOUNTAIN_TYPES.includes(t);
}

export function isWaterType(t: TileType): boolean {
  return t === TileType.Water;
}

export const TILE_TYPE_COLORS: Record<TileType, number> = {
  [TileType.GrasslandLand]: 0x4c9a3d,
  [TileType.GrasslandForest]: 0x2e6b24,
  [TileType.GrasslandMountain]: 0x8a8a8a,
  [TileType.DesertLand]: 0xe0c068,
  [TileType.DesertForest]: 0x9c8b3f,
  [TileType.DesertMountain]: 0xb89968,
  [TileType.TundraLand]: 0xf2f2f7,
  [TileType.TundraForest]: 0xbcd8bc,
  [TileType.TundraMountain]: 0xc8c8d0,
  [TileType.TaigaLand]: 0x4f8a5e,
  [TileType.TaigaForest]: 0x2f5a4a,
  [TileType.TaigaMountain]: 0x9aa0a8,
  [TileType.RainforestLand]: 0x3d8f4f,
  [TileType.RainforestForest]: 0x1f6b35,
  [TileType.RainforestMountain]: 0x6f8f7a,
  [TileType.Water]: 0x2f6fb3,
  [TileType.Settlement]: 0xd8c9a3,
};

export const TILE_TYPE_NAMES: Record<TileType, string> = {
  [TileType.GrasslandLand]: t('tile.GrasslandLand'),
  [TileType.GrasslandForest]: t('tile.GrasslandForest'),
  [TileType.GrasslandMountain]: t('tile.GrasslandMountain'),
  [TileType.DesertLand]: t('tile.DesertLand'),
  [TileType.DesertForest]: t('tile.DesertForest'),
  [TileType.DesertMountain]: t('tile.DesertMountain'),
  [TileType.TundraLand]: t('tile.TundraLand'),
  [TileType.TundraForest]: t('tile.TundraForest'),
  [TileType.TundraMountain]: t('tile.TundraMountain'),
  [TileType.TaigaLand]: t('tile.TaigaLand'),
  [TileType.TaigaForest]: t('tile.TaigaForest'),
  [TileType.TaigaMountain]: t('tile.TaigaMountain'),
  [TileType.RainforestLand]: t('tile.RainforestLand'),
  [TileType.RainforestForest]: t('tile.RainforestForest'),
  [TileType.RainforestMountain]: t('tile.RainforestMountain'),
  [TileType.Water]: t('tile.Water'),
  [TileType.Settlement]: t('tile.Settlement'),
};
