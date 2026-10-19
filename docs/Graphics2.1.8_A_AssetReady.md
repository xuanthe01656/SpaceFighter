# Space Fighter Graphics 2.1.8-A - Asset-Ready Foundation

**Upgrade baseline:** Graphics 2.1.7-BG.4 Preview FULL SOURCE.
**Scope:** Client-side presentation/catalog. Server, Firebase Auth, Firestore rules, currency, stored IDs, combat balance, background defaults and quests are UNCHANGED.

## Why this phase exists

The game must keep running when commercial art has not been delivered. A known gameplay ID never silently becomes another visual ID. The visual profile describes the expected image/model while current fallback geometry and in-memory SVG thumbnails cover absent assets. The asset-loading layer must never replace a collider or a gameplay root.

## Implemented in Phase A

- `src/game/assets/AssetRegistry.js`: 101 stable visual contracts, optional sockets, canonical image/model paths.
- `src/game/assets/AssetPlaceholder.js`: deterministic per-ID temporary SVG icons, created entirely offline; intentionally labeled TEMP.
- `src/game/assets/AssetAvailability.generated.js`: build-generated presence map, stops missing-asset 404s.
- `src/game/rendering/BattleEntityVisual.js`: optional sprite attached to existing enemy/Boss mesh. Existing mesh still drives physics, damage, AI and HP bars. If image fails, keep original geometry.
- Campaign/Dungeon: enemy and boss scene attachments; wingman and drone sprite source resolved through same registry.
- HQ, Inventory, Pilots: equipment and pilot icons resolved through common thumbnails. Ship catalog remains compatible and accepts optional canonical HQ/top images.
- `scripts/generate-visual-manifest.mjs`: scans local delivered art; runs automatically in prebuild.
- `scripts/check-asset-contracts.mjs`: development validation; `--release` is intentionally strict and WILL FAIL while assets are missing or unreviewed.
- `scripts/export-visual-placeholders.mjs`: create an offline visual gallery for artists/QA.
- `assets/visual-art-approvals.json`: future reviewed SHA-256/license records, empty until original artwork is approved.

## Delivering real 2D art WITHOUT editing scene code

Copy the asset to the canonical path. Names and IDs are contractual:

| Category | Preview icon/HQ | In-battle top sprite |
|--|--|--|
| Campaign enemy | `public/images/visuals/enemy/p1_small.webp` | `public/images/visuals/enemy/p1_small_top.webp` |
| Campaign boss | `public/images/visuals/boss/p1_boss_mech.webp` | `public/images/visuals/boss/p1_boss_mech_top.webp` |
| Dungeon enemy | `public/images/visuals/dungeon_enemy/dung_nereus_scout.webp` | `public/images/visuals/dungeon_enemy/dung_nereus_scout_top.webp` |
| Dungeon boss | `public/images/visuals/dungeon_boss/dung_nereus_boss.webp` | `public/images/visuals/dungeon_boss/dung_nereus_boss_top.webp` |
| Ship | `public/images/visuals/ship/ship_scout.webp` | `public/images/visuals/ship/ship_scout_top.webp` |
| Gear | `public/images/visuals/equipment/gun_laser.webp` | Optional `public/images/visuals/equipment/gun_laser_top.webp` |
| Pilot | `public/images/visuals/pilot/pilot_alpha.webp` | Not needed in combat |

For either battle entity, the top file takes priority; if absent, the icon WebP can be used as the sprite. Ship top sprites have nose at image top (combat -Z). Sprite artwork SHOULD have transparent background and margins suitable for the visual size configured in the registry. Collision is still controlled by gameplay, not by the art's alpha bounds.

To add a NEW FILE to the checked manifest:

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\client
npm run assets:manifest
npm run check:asset-contracts
npm run build
```

The next run automatically chooses delivered art; no Campaign/Dungeon source change is needed for **2D files matching the existing contract**. If a file is replaced at the *same* path, rebuild/deploy the artifact and allow caches to update.

## Temporary assets

In the development game, known missing ships still have deterministic 2D and Babylon geometry fallbacks, Campaign/Dungeon enemies and bosses retain procedural geometry, and missing equipment/pilot images use distinct SVG data URLs labeled TEMP. They are generated from the exact same asset IDs as the official paths; no external AI credits or network requests needed. Use:

```bat
npm run assets:preview
```

Open `client/assets/visual-placeholder-gallery.html` in a browser. It is a review-only file; it is not shipped under `public` and cannot accidentally be treated as approved art.

## Planned, NOT completed in A

- Enemy/Boss GLB import, skeletal animations, LOD, animation retargeting and model pooling (2.1.8-B/C).
- Equipment 3D attachments with mount coordinate calibration, animated weapon visuals, pilot avatar animation (2.1.8-C).
- Animated VFX/audio catalogs and event routing (2.1.8-D).
- Final mobile memory budgets, localization/rarity skins, native tests and art release QA (2.1.8-E).
- External asset hot-patches/CDN version switching; current packaged assets still require a new build for stores.

Do NOT mark this version as commercial-release ready. The strict release gate intentionally refuses unresolved TEMP art and missing license/approval metadata.

## Windows verification

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\client
npm ci
npm test
npm run assets:manifest
npm run assets:preview
npm run check:asset-contracts
npm run check:catalog
npm run check:gameplay
npm run check:graphics21
npm run build
npm run dev
```

**UAT:** open Pilot screen, HQ gear slots, Inventory, Campaign Alpha and Dungeon Nereus. Compare target/HP/loot before and after; replace one test enemy `_top.webp`, run `npm run build`, check sprite appears with its original hitbox and all other units unchanged. Repeat with intentionally missing sprite to test procedural fallback. Exit/re-enter 5 times and monitor Babylon resource counts. Do not add unreviewed art to `visual-art-approvals.json`.
