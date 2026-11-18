# Space Fighter V4.5.0 RC1 - Dungeon Runtime Reliability (ban giao Viet Nam)

## Pham vi

- Khong thay doi battle authority, kinh te, reward, Cloud Run, Firebase, catalog, GLB hoac CDN.
- Chot sua lifecycle Dungeon: App.jsx tao moi `getRealTime` moi lan render, nhung DungeonEngine cu xem no la dependency cua effect Babylon. App rerender co the dispose/recreate scene giua tran.
- Bao ve exception render: `scene.render()` co try/catch. Mot loi thoang qua khong duoc thoat ra ngoai requestAnimationFrame.
- Sau 3 loi render lien tuc: ngung loop; watchdog thu khoi dong lai loop TOI DA MOT LAN; neu van loi thi hien thong bao, KHONG tao victory hoac reset tran.
- Theo doi 2 nhip rieng: render frame va simulation heartbeat. Phan biet `render_stalled`, `simulation_stalled`, `render_exception`, `webgl_context_lost`.
- Background/resume co grace period; khong bao nham freeze khi WebView tam ngung.
- APK QA build bang `assembleDebug` duy nhat. Khong chay `bundleDebug` va khong upload `.aab`.
- Khong sua workflow release candidate (AAB de sau, chi chay khi co lenh release rieng).

## Nguon kiem tra

- Audit source tai `main` HEAD dc2120b4fbba0e685175ce474767997f48e53244, ngay 18/11/2026.
- `client/src/App.jsx` line 100: `const getRealTime = () => ...`; App tao function moi moi render.
- `client/src/components/Dungeon/DungeonEngine.jsx` cu line 200: effect depends on getRealTime, saveUserProfile, gameAction.
- `client/src/components/Dungeon/DungeonEngine.jsx` cu line 186-188: scene.render() khong co error boundary.
- `client/src/components/Dungeon/DungeonScene.js` line 2859-3533: simulation trong onBeforeRenderObservable; exception co the cat duong render.
- `client/src/components/Dungeon/DungeonScene.js` line 878-885: visual preload da co deadline 2.6s, KHONG phai bang chung cho mot preload-block vo han.
- `client/src/game/dungeon/DungeonEncounterDirectorV38.js` line 219-227: spawn loop da gioi han maxSpawnEventsPerStep; khong co bang chung vo han.
- `.github/workflows/android-native-smoke.yml` cu line 351-353 va 420-421: debug workflow chay APK va AAB. RC1 doi thanh APK-only.

## Ket luan ve bang chung

Co 2 hazard tim thay trong source (lifecycle effect va exception render). Khong co log WebGL tu luc dung gameplay tren Redmi, nen CHUA DU BANG CHUNG de ket luan mot hazard la nguyen nhan duy nhat cua lan dung cu.

## Nghiem thu

1. QA Unified Android APK chay local, khong co trusted writes/rewards.
2. Tung Dungeon Taurus, Nereus, Abaddon: 5 luot lien tuc/toan bo room, di qua Boss va ket thuc/thoat.
3. Moi Dungeon: 3 lan background/resume, 3 lan rut lui/vao lai.
4. QA no `render_exception`/`simulation_stalled`/`render_stalled`/`webgl_context_lost` sau khi ung dung dang foreground.
5. Neu bao do: chup QA evidence va thu thap log Chromium `DUNGEON_RUNTIME_` (khong can tai khoan/du lieu ca nhan).
6. Build tu `Space Fighter Android - Capacitor 8 Native Smoke`, input `unified_campaign_dungeon_qa = true`, con lai false. Artifact chi co `app-debug.apk`.
7. Chua the goi production PASS chi vi focused tests PASS: phai check tren Redmi Turbo 4 Pro theo ca 3 Dungeon.

## Xu ly loi/rollback

Chay `node V450_SAFE_APPLY.mjs --repo <thu-muc-SpaceFighter> --rollback --backup <duong-dan-backup-da-in-ra>`.
Chuong trinh rollback chi khoi phuc khi file van giong version V450, khong ghi de source thay doi sau do.

## Pham vi source

- client/src/components/Dungeon/DungeonEngine.jsx
- client/src/components/Dungeon/DungeonScene.js
- client/src/game/dungeon/DungeonRuntimeReliabilityV450.js
- client/tests/dungeonRuntimeReliabilityV450.test.mjs
- client/tests/nativeAndroidSocialLoginBridge.test.mjs
- client/tests/c15Rc6AndroidRelease.test.mjs
- .github/workflows/android-native-smoke.yml
- client/docs/DUNGEON_RUNTIME_RELIABILITY_V450_VI.md
