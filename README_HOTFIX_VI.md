# Space Fighter Graphics 2.1.8-B1 - Audit Hotfix v1.1

## Pham vi

Ban va chi ap dung cho baseline **1.2.1-graphics21.8-assetsB1.0** da cai du 30 atlas WebP. Ban va khong thay game runtime, scene, Enemy/Boss renderer, chi so chien dau, backend, Firebase, background, hay tai san hinh anh.

## Ngay 19/10/2026 - ket qua dieu tra

Sau khi cai 30 atlas va chay `npm run assets:manifest`, ba bai test cua baseline B1 fail do su dung asset manifest that khi dang thu tinh huong "thieu asset":

1. `client/tests/assetReady218a.test.mjs`: `missing art yields per-ID fallback ...` ky vong placeholder, nhung atlas da co => `asset-present`.
2. Cung file: `runtime keeps existing enemy collision mesh when visual is unavailable`: Babylon mock trong test khong co MeshBuilder, song asset that khien renderer goi MeshBuilder.
3. `client/tests/enemyBossVisual218b1.test.mjs`: `a missing atlas or static sprite sends no HTTP request ...` ky vong khong tai texture, song atlas that da co trong manifest.

**Khac phuc:** Tinh huong "thieu asset" su dung `resolveAssetVisual(kind,id,new Set())` de mo phong manifest rong. Test khong can xoa atlas that; cac tinh huong co asset van duoc test o bai khac.

`SpaceFighter_Check_218B1.ps1` (v1.1) sua `@($script:Results)` / `@($script:Runs)` thanh `.ToArray()` khi tao bao cao, tranh loi `Argument types do not match` tren Windows PowerShell 5.1. Phan build now includes exit code, completion marker, and `dist/index.html` inspection. Thanh cong mot lan build khong du de khang dinh runtime WebGL.

## Tap tin thay doi

- `client/tests/assetReady218a.test.mjs` (test-only)
- `client/tests/enemyBossVisual218b1.test.mjs` (test-only)
- `SpaceFighter_Check_218B1.ps1` (audit v1.1)
- `README_HOTFIX_VI.md` (this guide)

Khong co code gameplay/Firebase/server/renderer nao trong patch.

## Cach cai dat

1. Sao luu thu muc `client/tests` va script audit neu da tu chinh sua.
2. Dung CMD/PowerShell dang chay test hoac build.
3. Giai nen ZIP vao `C:\Users\TVH01374\Desktop\SpaceFighter`, chon ghi de ba file noi tren. **Khong giai nen vao `client`** vi ZIP da co san cay `client/tests/...`.
4. Giu nguyen bo 30 atlas tai `client/public/images/visuals/...`, khong can cai lai asset hoac `npm ci`.

### Test truc tiep

```powershell
$root = 'C:\Users\TVH01374\Desktop\SpaceFighter'
Set-Location "$root\client"
npm run assets:manifest
npm test
npm run check:enemy-boss-art
npm run build
```

Mong doi `136/136 PASS`, `30 delivered atlases`, Vite `built in ...`.

### Chay audit v1.1

```powershell
$root = 'C:\Users\TVH01374\Desktop\SpaceFighter'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$root\SpaceFighter_Check_218B1.ps1" -ProjectRoot $root -ManualQAConfirmed
```

Su dung `ExecutionPolicy Bypass` chi neu phu hop chinh sach may va to chuc. Script khong can quyen Admin, khong chinh sua Firebase. `npm run build` van tao `client/dist` va `prebuild` tao lai manifest theo project.

Bao cao o `B1_AUDIT_REPORTS/B1_YYYYMMDD_HHMMSS/B1_Audit_Report.txt` va `.json`, kem log per command.

## Quan trong ve loi build trong log cu

Log console lan audit 14:25 chi ghi `Vite production build - Build not confirmed`, **khong co noi dung file `vite_production_build.log`**, nen chua ket luan duoc build khong thanh cong hay script nhan dien sai text thanh cong. Hotfix v1.1 ghi ro `Exit`, su ton tai `dist/index.html` va marker `built in`.

Neu `npm run build` chay truc tiep that bai, gui **80 dong cuoi** cua log moi va bao cao:

```powershell
$latest = Get-ChildItem "$root\B1_AUDIT_REPORTS" -Directory | Sort-Object Name -Descending | Select-Object -First 1
Get-Content (Join-Path $latest.FullName 'vite_production_build.log') -Tail 80
```

Neu script ghi `PASS_WITH_WARNINGS` do chua chay Server tests, Babylon bundle lon, hoac B2 chua du chuc nang, do la canh bao phan loai theo pham vi B1, khong phai FAIL.

## Kiem thu da thuc hien khi dong goi

- Atlas chua cai: 19/19 PASS voi hai file test lien quan.
- Atlas da cai + manifest 40 art paths: 19/19 PASS voi hai file test lien quan.
- Atlas da cai + manifest 40 paths: **132/132 Node tests khong phu thuoc Babylon PASS**.
- Enemy/Boss validator: 30/30 atlas PASS; manifest 40/40 paths PASS.
- 4 bai Babylon NullEngine chua chay lai trong moi truong dong goi (thieu `@babylonjs/core`), can `npm test` tren Windows.
- PowerShell Windows 5.1 chua chay tai moi truong dong goi (khong co PowerShell), can xac nhan tren may user.
- Vite build Windows chua chay lai tai moi truong dong goi; can xem log moi.
