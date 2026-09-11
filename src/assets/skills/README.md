# Skill textures

120x120px skill tree images — one source PNG per skill.

These source files are never modified by the game. At build time they are
packed into a single compressed atlas plus a generated manifest:

- `public/textures/skills-atlas.png` — the packed atlas
- `src/game/skillAtlasData.gen.ts` — generated frame coordinates, imported by
  `src/ui/kit/skillIcons.ts`

Regenerate these committed artifacts after adding or changing any icon:

```bash
npm run pack:skills
```

The packer lives in `tools/packSkills.mjs` (pure Node, no dependencies) and is
covered by `tests/packSkills.test.ts`, which also verifies the committed atlas
stays in sync with the packer output.