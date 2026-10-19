# Space Fighter 2.1.8-B1 - Enemy/Boss Sprite Atlas Contract

This schema belongs to the visual layer only. Campaign and Dungeon HP, AI, hitboxes,
movement, damage, rewards, Firebase and battle tickets do not depend on artwork.

## Deliverable per enemy/Boss gameplay ID

- Static still (optional): `public/images/visuals/{kind}/{id}_top.webp`
- Animated atlas (optional): `public/images/visuals/{kind}/{id}_sheet.webp`
- Model reservation (not yet loaded by this battle adapter): `public/models/visuals/{kind}/{id}.glb`
- `kind` is one of `enemy`, `boss`, `dungeon_enemy`, `dungeon_boss`.
- IDs are stable. Use `npm run check:asset-contracts` for the complete list.

The current animation atlas uses a **fixed 4 columns x 4 rows** of equal-sized cells,
16 frames total, numbered left-to-right and top-to-bottom (indices 0..15).
Recommended development sheet: **512 x 512 transparent WebP** (128 x 128 per cell).
The validator accepts 4x4 sheets up to 2048 x 2048, with cells at least 64 x 64.
Keep the image top-down, nose aimed at the TOP of every cell, consistent pivot,
consistent character scale, no HUD/no labels/no background and no padding spilling
into neighboring cells. Avoid bright edge bleeding; reserve transparent pixel gutters.

| Frame index | Visual state |
|---|---|
| 0, 1, 2 | Spawn |
| 3, 4, 5, 6 | Idle loop |
| 7, 8, 9, 10 | Move loop |
| 11, 12 | Attack flash |
| 13 | Hit flash |
| 14, 15 | Enrage / impact frames |
| 15, 14, 13 | Death clip reserved |

Runtime priority: `death > hit > enrage > attack > spawn > move/idle`.
Moving/attacking/hit/enrage events are connected to both scenes. A combat death
still removes the original root immediately, so this B1 release does NOT display
an extended death clip after cleanup; existing explosion FX remains active.
An independent death visual afterimage is planned for B2.

Runtime fallback: atlas (if present) -> static `_top.webp` -> original procedural
mesh. Bad/late downloads do not create phantom colliders. Animated sheets use
shared materials but each monster has its own vertex UV data.

## Integration

1. Put reviewed art at the canonical path with the **existing gameplay ID**.
2. Run `npm run assets:manifest` and `npm run check:asset-contracts`.
3. Build and test Campaign and Dungeon in desktop/mobile.
4. Store approval/license/sha256 in `client/assets/visual-art-approvals.json` before
   allowing release. Temporary atlases have no commercial approval.
5. A later GLB pack needs export axes/scale/socket QA before the game can load it.

No source edits should be necessary when replacing a conforming static sprite or
animated 4x4 atlas. Adding a new visual format/animation layout requires a new
versioned contract, not ad-hoc scene changes.
