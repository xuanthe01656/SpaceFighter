# Space Fighter Graphics 2.1.8-B2.1 - Visual Lifecycle & Death Animation

## Baseline va muc tieu

- Nen bat buoc: Graphics 2.1.8-B1 da nghiem thu, Audit Fix v1.1, 30 atlas tam da cai.
- B1 audit (19/10/2026): 17 PASS, 3 WARN, 0 FAIL; 136/136 tests; build PASS.
- B2.1: khi quai/Boss bi ha, loai gameplay hitbox NGAY trong frame va giu sprite trong hang doi toi da ~250ms de phat animation death.
- Cac truong hop roi khoi man hinh / va vao nguoi choi van don dep ngay, khong bi coi la quai chet do dan.
- Khong doi AI, HP, sat thuong, phan thuong, Firebase, economy, background, trang bi, ship, BG assets.

## Chon goi cai

**PATCH ONLY**: dung khi project tren may da la B1 + Audit Fix v1.1 va co 30 atlas. Giai nen vao thu muc goc `SpaceFighter`, cho phep ghi de file code/test. PATCH khong xoa asset hien tai va khong chua background moi.

**FULL SOURCE**: doc lap, da bao gom FULL SOURCE B1, audit-fix test, 30 atlas B1 va cac WebP placeholder tuy chon A da su dung trong baseline audit (tong 181 duong dan asset ma manifest nhan dien). Luu tai thu muc RIENG de so sanh; khong ghi de project dang chay neu chua backup.

## Thu tu tren Windows (PowerShell; may cong ty chay npm.cmd)

1. Backup thu muc SpaceFighter hoac it nhat commit/tag branch B1 hien tai. Luu `B1_AUDIT_REPORTS/B1_20261019_145228`.
2. Dung `npm run dev` neu dang chay, dong game, giai nen PATCH vao `C:\Users\TVH01374\Desktop\SpaceFighter`.
3. Mo PowerShell va chay:

```powershell
$root = 'C:\Users\TVH01374\Desktop\SpaceFighter'
Set-Location "$root\client"
npm.cmd pkg get version
npm.cmd run assets:manifest
npm.cmd run check:enemy-boss-art
npm.cmd run check:asset-contracts
npm.cmd run check:catalog
npm.cmd run check:gameplay
npm.cmd run check:graphics21
npm.cmd run check:safety
npm.cmd run check:imports
npm.cmd test
npm.cmd run build
```

- Version mong doi: `1.2.1-graphics21.8-assetsB2.1.0`.
- Unit tests mong doi: **143/143 PASS, 0 FAIL** (136 baseline + 7 kiem thu B2.1), neu day du Babylon.js dependencies.
- Atlas: **30/30**, visual contracts **101**.
- Asset paths: **181** neu ban da cai ca goi placeholder A; **40** neu chi cai 30 atlas B1. Ca hai deu hop le.
- Build: can `built in ...s` va `exit 0`.
- Neu PowerShell chan npm.ps1 thi dung `npm.cmd`; khong can doi execution policy.

**Luu y**: script `SpaceFighter_Check_218B1.ps1` la baseline audit B1; no kiem tra version va SHA B1 nen KHONG dung lam bo kiem thu B2.1 (no se FAIL dung thiet ke).

## QA can thuc hien trong game

1. Campaign Alpha: ha quai thuong, quan sat animation `death` (atlas dang phat ~0.25s) trong khi dan cua nguoi choi khong con va cham root quai da chet.
2. Dungeon Nereus: lap lai voi quai scout/elite/heavy. Thua/thang/wave phai nhu B1.
3. Boss Campaign va Dungeon: hieu ung chet phat ngan, khong co Boss tan cong sau khi HP=0, thuong/diem chi cong mot lan.
4. Ha nhieu quai sat nhau: khong crash, visual khong luu lai sau khi xong animation. Pool toi da 32 death visuals.
5. Roi tran khi quai dang chet: vao lai tran khong con sprite cu, request load muon khong tao lai doi tuong.
6. Tat thiet bi/Power Save: atlas khong mo lai hitbox, CPU/GPU khong tang bat thuong.
7. Kiem tra hinh anh va FPS tren mobile va desktop thuc (NullEngine/static test KHONG thay the WebGL QA).

## Cach hoat dong

`BattleEntityVisual.detachForDeath()` tach sprite plane da load khoi collider (giu nguyen toa do world) va nhuong quyen so huu cho `BattleDeathVisualQueue` cua scene. Root gameplay bi dispose ngay. Queue cap nhat death clip bang mot scene observer, gioi han 32 sprite, auto dispose khi ket thuc / scene dispose. Neu atlas chua load hoac loi, fallback don dep ngay va van co VFX explosion cu.

## Pham vi chua hoan thanh

- GLB quai/Boss, skeletal animation, socket muzzle va runtime LOD: de lai cho B2.2 - B2.4.
- Asset phat hanh thuong mai: chua phe duyet (TEMP).
- Build/NullEngine/WebGL chinh thuc cua B2.1 can user chay tren Windows; phia tao patch chi test duoc 139 test Node khong phu thuoc Babylon.

## Rollback

Neu bat ky kiem thu nao FAIL: dung client, phuc hoi backup/tag B1 + audit-fix v1.1. KHONG chay migration database, KHONG xoa atlas, KHONG can rollback Firebase.
