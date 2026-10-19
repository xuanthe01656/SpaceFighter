# Space Fighter 2.1.8-B1 — Kiểm tra trước khi triển khai B2

## Mục đích

Đối chiếu project Windows **Graphics 2.1.8-B1 + 30 animation atlas tạm** với FULL SOURCE B1 đã bàn giao. Script kiểm tra phiên bản, 43 fingerprint SHA-256 cố định của code quan trọng, 30 atlas WebP, 101 hồ sơ visual, manifest, 8 background, gameplay, security, graphics, import, 136 bài kiểm thử và Vite build. Tạo log chi tiết và báo cáo JSON/TXT.

**Script không tự tải/cài package, không truy cập Firestore production, không chạy migration, không xóa/chỉnh sửa ảnh.** Lưu ý lệnh `npm run build` chạy `prebuild` của project nên có thể **tái sinh manifest visual** và ghi `client/dist`. Nếu muốn tránh build, dùng `-SkipBuild` (khi đó *chưa* được coi là kiểm tra đủ). `-RefreshManifest` là lệnh chủ động tái tạo manifest khi ảnh vừa bổ sung.

## 1. Chuẩn bị

- Hệ điều hành Windows, Windows PowerShell 5.1 hoặc PowerShell 7.
- Node.js >= 20, npm, `client/node_modules` đã cài (`cd client; npm ci` nếu chưa có).
- Đã giải nén PATCH B1, gói **30 atlas tạm** vào đúng `SpaceFighter/client/public/images/visuals/...`, và đã chạy `npm run assets:manifest`.
- Đặt `SpaceFighter_Check_218B1.ps1` trong `C:\Users\TVH01374\Desktop\SpaceFighter\` hoặc truyền tham số `-ProjectRoot`.

## 2. Cách chạy đầy đủ

Mở **PowerShell** (không cần quyền Administrator) rồi nhập:

```powershell
$root = 'C:\Users\TVH01374\Desktop\SpaceFighter'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$root\SpaceFighter_Check_218B1.ps1" -ProjectRoot $root -ManualQAConfirmed
```

`-ExecutionPolicy Bypass` chỉ áp dụng cho **tiến trình PowerShell được khởi chạy**; không thay đổi vĩnh viễn policy hệ thống. Trên máy bị chặn bởi chính sách công ty, tuân theo chính sách IT và chạy riêng các lệnh npm được mô tả ở phần 4; không cố gắng vượt cơ chế bảo vệ của công ty.

**Tùy chọn**: 

```powershell
# Chạy nhanh, không build Vite (sẽ có WARN vì chưa nghiệm thu build)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$root\SpaceFighter_Check_218B1.ps1" -ProjectRoot $root -SkipBuild -ManualQAConfirmed

# Thử thêm unit test server (cần server/node_modules, npm ci ở server nếu thiếu)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$root\SpaceFighter_Check_218B1.ps1" -ProjectRoot $root -IncludeServerTests -ManualQAConfirmed

# Chỉ dùng khi manifest visual lỗi do vừa chép thêm/đổi asset
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$root\SpaceFighter_Check_218B1.ps1" -ProjectRoot $root -RefreshManifest -ManualQAConfirmed
```

## 3. Kỳ vọng

- **PASS** `1.2.1-graphics21.8-assetsB1.0`.
- **PASS** Node >= 20, dependencies.
- **PASS** SHA-256 **43 file** thuộc gameplay, visual code, server, Firestore, catalog, scenes. Script kiểm chứng đúng theo FULL SOURCE B1 và cố ý **loại trừ `AssetAvailability.generated.js`** vì file này sẽ thay đổi khi chép 30 atlas.
- **PASS** 30 atlas phân loại đúng: 12 quái Campaign, 6 Boss Campaign, 9 quái Dungeon, 3 Boss Dungeon.
- **PASS** validator trả `30 profiles, 30 delivered atlases, 7 states each` và asset manifest có **101 visual ID**.
- **PASS** 8 background assets SHA-256/dimensions, 14/14 gameplay static, 12/12 graphics static, 14/14 security static, import và 136/136 `npm test` (0 skipped).
- **PASS** Vite build và kiểm tra output dist (trừ khi chọn `-SkipBuild`).
- **WARN** hợp lệ: artwork production vẫn chưa được phê duyệt, chunk Babylon còn lớn, chưa chạy test server nếu không chọn `-IncludeServerTests`, B2 (GLB, animation xương, death-afterimage, LOD) chưa có. Các WARN là thông tin; không đồng nghĩa test lỗi.

## 4. Nếu script báo FAIL

Script in đường dẫn từng file log tại: 

```
SpaceFighter/B1_AUDIT_REPORTS/B1_YYYYMMDD_HHMMSS/
  B1_Audit_Report.txt
  B1_Audit_Report.json
  B1_Source_Drift.txt             (nếu mã nguồn lệch fingerprint)
  npm_test.log
  enemy_boss_atlases.log
  visual_asset_contracts.log
  vite_production_build.log
  ...
```

- `B1 SHA-256 baseline` FAIL: file mã nguồn hiện tại khác source B1. Không ghi đè vội vì có thể là sửa đổi hợp lệ của bạn; gửi `B1_Source_Drift.txt` để rà.
- `Temporary atlas folders` FAIL: kiểm tra đường dẫn giải nén không bị lồng `client/client` và đủ 30 sheet.
- `Visual contract + manifest` FAIL: nếu atlas đã đầy đủ nhưng manifest cũ, chạy `npm run assets:manifest` trong `client`, hoặc chạy script với `-RefreshManifest`, rồi kiểm tra lại.
- `Full client tests` FAIL: mở `npm_test.log`, gửi đoạn `failing tests`.
- `Vite production build` FAIL: mở `vite_production_build.log`; chỉ kết luận lỗi khi command trả exit code khác 0 hoặc không có dấu mốc build hoàn thành.
- `Server tests` WARN SKIPPED: cài dependencies đúng trong thư mục server nếu muốn test API. Script **không kết nối API production**.

Không nên tiến hành B2 nếu còn **FAIL**. Cũng không nên coi B1 là đã được phát hành thương mại chỉ vì các kiểm thử PASS. Trải nghiệm game thật (animation, hitbox, FPS, giao diện) đã được bạn nghiệm thu 7/7 và được đánh dấu **user-confirmed** khi có `-ManualQAConfirmed`; script không tự kiểm chứng WebGL.

## 5. Gửi kết quả lại để đánh giá

Gửi file `B1_Audit_Report.txt` và, nếu có FAIL, file `.log` tương ứng hoặc `B1_Source_Drift.txt`. Không cần gửi thư mục `node_modules`, `dist`, `.env`, Firebase credential hoặc token.
