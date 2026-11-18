# Space Fighter V4.4.6 - Portal / Hangar Structural Refactor

## Baseline

After V4.4.5, the live Portal contains two Headquarters buttons (V443 and V444). One was merely hidden by a CSS selector. The central Command Deck is also mounted as an extra interactive panel. Both are removed from the active JSX instead of layering more hiding rules.

## Portal contract

- Keep the original galaxy portal background and top resources/profile.
- Do not mount PortalCommandDeckV444. Keep its files for rollback only.
- Use existing five utility handlers: top-up, attendance, events, missions and resource downloads; two side rails with three positions left and two right.
- One battle row: Dungeon + Campaign, unchanged destinations.
- Exactly four unique management actions: Headquarters, Inventory, Pilots, Shop.
- The HQ icon is different from Inventory's briefcase icon.
- No change to login, currency, energy, mission claims, rewards, or profile persistence.

## HQ contract

- Full title, current ship, CP, level and star row; one ship preview, six silent loadout icons.
- Pilot portrait and equipment fallbacks remain from V4.4.4.
- Three tabs (equipment, skills, appearance), owned ship list, stats and controls remain.
- `manage` from Portal must never launch; `prebattle` from Stage/Dungeon selection may launch.
- Actions remain in document flow, no fixed bar covering the content.

## Gates

1. Run V446_SAFE_APPLY.mjs --dry-run, then --apply.
2. Run `node --test tests/portalHangarStructuralV446.test.mjs` from client.
3. Run `npm.cmd test` and `npm.cmd run build:mobile` on Windows PowerShell.
4. Run `git diff --check`, review exact file scope, commit and push only after all pass.
5. GitHub Actions Unified QA APK: inspect portrait, landscape, four dock destinations, both battle CTA destinations, HQ manage vs prebattle, and pilot fallback.

## Important

V4.4.6 is a UI/layout patch. It does not activate Meshy GLB models, external CDN, or change combat authority. Previous V442-V445 tests whose text asserted obsolete active Portal layouts are migrated to assert the current V446 contract while preserving their other regression checks.
