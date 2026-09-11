# Achievement textures

164x164px achievement icons — one source PNG per achievement.

These source files are never modified by the game. At build time they are
packed into a single compressed atlas plus a generated manifest:

- `public/textures/achievements-atlas.png` — the packed atlas
- `src/game/achievementAtlasData.gen.ts` — generated frame coordinates, imported
  by `src/ui/kit/achievementIcons.ts`

Regenerate these committed artifacts after adding or changing any icon:

```bash
npm run pack:achievements
```

The packer lives in `tools/packAchievements.mjs` (pure Node, no dependencies,
reusing the PNG codec from `tools/packSkills.mjs`) and is covered by
`tests/packAchievements.test.mjs`, which also verifies the committed atlas stays
in sync with the packer output.