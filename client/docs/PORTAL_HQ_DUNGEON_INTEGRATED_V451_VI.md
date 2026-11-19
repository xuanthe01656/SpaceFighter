# V4.5.1 - Portal, Headquarters, Dungeon integrated QA gate

Status before integration: Dungeon V4.5.0 RC1 has passed the user's 10/10 Android QA checklist. That result covers the earlier Dungeon-only APK and does NOT certify this new combined APK.

Goal: publish the already-reviewed local UI work (Portal V4.4.11 and HQ V4.4.12 R2) without changing gameplay, wallet data, server authority, or the APK-only native QA workflow.

Runtime baseline: Dungeon V4.5.0; no new gameplay mechanic is introduced in this integration.

Integration checks:
1. Portal two-tier player header, five genuine resource values, two battle entries, four dock entries.
2. HQ wallet pills removed from header while game currency values remain preserved elsewhere; six equipment slots and dual manage/prebattle flow.
3. HQ ship previews show whole ship (contain), and native WebP CTA content is optically aligned.
4. Dungeon render-loop watchdog, simulation heartbeat, context-loss guard and event cleanup remain present.
5. GitHub Android manual Unified QA produces signed debug APK only, never the AAB bundle.
6. Existing V4.4.9 through V4.5.0 tests remain required.

The installer never overwrites current UI, Dungeon, or other project source. It adds only this test and document if they are missing. It verifies the current source against the integration contract before writing. The finalizer stages only enumerated UI files plus this gate. It never does git add ., git reset, git clean, or git restore.

After staging gate: run full npm tests and npm run build:mobile, commit/push manually through the explicit finalizer only when those gates pass, and run Android Unified QA from main. Keep all non-scope local files out of the commit.

Device acceptance: screenshot Portal/HQ at physical resolution, enter both management/prebattle contexts, verify whole ship thumbnails and 2 native CTA labels, enter each Dungeon, retire/reenter, background/resume, and ensure V450 runtime stall warnings do not recur. Only then close V4.5.1 integrated APK QA.
