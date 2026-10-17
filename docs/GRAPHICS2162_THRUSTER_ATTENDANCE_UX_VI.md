# Space Fighter Graphics 2.1.6.2 - Engine Mounts & Attendance Makeup UX

Baseline: Graphics 2.1.6.1 Player VFX. Scope: **visual placement and attendance UI only**. No new currencies, rewards, cooldowns, or Firebase migrations.

## 1. Engine mount design

`client/src/game/catalog/aircraft.js`: X-Wing now centers its exhaust at `{x:0,y:-0.13,z:1.01}` and declares `engineMounts` explicitly.

For future ships define:

```js
engineMounts: [
  { id: 'left', offset: { x: -0.35, y: 0, z: 1.1 }, scale: 0.8 },
  { id: 'right', offset: { x: 0.35, y: 0, z: 1.1 }, scale: 0.8 },
],
```

Each mount uses local **playerRoot** coordinates: +Z behind the ship, X left/right, Y vertical. Balance left and right engine mounts symmetrically where appropriate. For GLB models that rotate/scale independently, verify positions visually on the imported ship; positions given here are not glTF-native vertices.

`PlayerFxProfiles.js` validates and bounds to max six engines per ship; deduplicates mount IDs, clamps scale and positions, and falls back to legacy `engineOffset` for existing ships. The single texture is reused. Core/rim particle budgets are *per ship*, divided across mounts. `ShipEngineFx.js` disposes all resources when the scene ends, shared by Campaign/Dungeon. No economic, combat-stat or collision modifications.

## 2. Attendance makeup policy: unchanged

- Week uses UTC Monday 00:00 -> next UTC Monday 00:00 (Vietnam: Monday 07:00).
- `makeupCount` counts **used weekly attempts**, not attempts made today.
- Two makeups per UTC week, first costing 50 diamonds, second costing 150 diamonds.
- Makeup is permitted only for a **past**, missed, unclaimed weekday **in the current UTC week**.
- No future/day-of/claimed-day makeup. The backend rejects invalid requests regardless of UI.
- Completing a make-up changes a weekly calendar slot, not natural attendance streak or day/week/month mission counters.
- Counter resets with a new UTC week. Already spent diamonds are not refunded.

Test profile observed previously: two makeup operations on 2026-10-16, `claimedDays:[1,2,5,6]` and 2 natural dates in that same week: 2/2 used is correct on October 17.

`AttendanceModal` now displays 'used per UTC week/remaining' and an explanatory status if the weekly quota is exhausted or no prior open weekday remains. Buttons exist only for eligible days, via `eligibleMakeupDaysUTC` shared read-only UI helper.

## 3. Validation and rollout

1. Stop the Vite client. Apply this PATCH ONLY to source root 2.1.6.1 (not to 2.1.6.0).
2. Server source code is unchanged; server *test cases* were extended. No migration or Firebase edits.
3. Run `npm test`, `npm run check:catalog`, `npm run check:gameplay`, `npm run check:graphics21`, `npm run build`, `npm run dev` in client.
4. Test Campaign/Dungeon X-Wing exhaust on mobile and desktop; center, cyan glow, engine start/stop.
5. Test attendance Cloud/Guest Friday/Saturday with two makeups: 2/2 used, no eligible buttons. Test a week with zero used but no prior missed day: no buttons, an explanation. On next Monday 07:00 Vietnam the preview resets to 0/2.

Source validation is not a substitute for WebGL Android/iOS device UAT or a real Vite build. The Node tests of this release do not require network access and do not change Firestore.
