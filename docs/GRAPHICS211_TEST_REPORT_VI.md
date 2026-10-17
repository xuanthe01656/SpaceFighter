# Ket qua kiem thu — Graphics 2.1.1 + Mission Sync Hotfix

Ngay thuc hien: 16/10/2026. Baseline: Space Fighter Graphics 2.1 V1.2.1.

## Tu dong: ket qua PASS

| Hang muc | Ket qua |
|---|---|
| Node server test suites (`node --test server/tests/*.test.cjs`) | 27 PASS, 0 FAIL, 3 SKIP |
| Node client test suites (5 files thuong, khong can Babylon) | 40 PASS, 0 FAIL |
| Test month goal: 2027/2028 Feb, 30/31 days, month crossover | PASS |
| Diem danh thuc/bu, gia 50/150, khong ghi mission Ghost, chong claim duplicate | PASS |
| Guest va Cloud legacy `lastDate`/`weekKey` migration, giu streak | PASS |
| Guest test trong TZ UTC, Asia/Ho_Chi_Minh, Pacific/Kiritimati, America/Los_Angeles | 15/15 moi TZ, 0 FAIL |
| X-Wing config yaw va phan tich truc GLB -X -> -Z | PASS tinh toan (chua UAT WebGL) |
| Graphics 2.1 static checks | 12/12 PASS |
| Gameplay Phase 2 static checks | 14/14 PASS |
| Phase 1 security static checks | 14/14 PASS |
| Import relative | 109/109 dung duong dan |
| Ship asset manifest | 16 tau, chinh xac danh sach hien huu |
| Kiem tra parser TypeScript | 45 file JS/JSX/MJS/CJS, 0 loi parse |
| Diff binary bao ve Firebase/auth/profile/Firestore service | Giong baseline, khong sua |

Chi tiet Node test va audit: `docs/GRAPHICS211_REGRESSION_LOG.txt`.

## Gioi han / warning co san trong baseline

- `server` co 3 bai test HTTP/Express SKIP vi thu vien Express khong duoc cai trong moi truong; khong duoc tinh la PASS.
- `client/tests/shipVisualNullEngine.test.mjs`: chua chay duoc vi package `@babylonjs/core` khong co san. `npm ci` da thu nhung timeout khong tai duoc thu vien; **Vite production build, NullEngine runtime va visual UAT van chua hoan thanh**.
- Source asset audit tra ve **59 missing literal references** (anh pilots, gears, ships, dungeons; da ton tai tu baseline). Lenh audit khong strict thanh cong nhung khong co nghia artwork day du.
- Audit config: **2 warnings**, `Capacitor appId` khac `Android applicationId` va khong co `google-services.json`. Release production native van bi chan cho den khi duoc xac minh.
- Khong truy cap profile Firebase thuc, khong xoa/di chuyen du lieu nguoi choi, khong deploy len server.

## UAT bat buoc sau khi cai dependencies

- Vao Campaign, Dungeon, Ship preview voi X-Wing; quan sat mui/duoi theo chieu di chuyen/ban dan; phan biet model/sprite fallback.
- Chuyen thoi diem qua `00:00:00Z` va Thu Hai `00:00:00Z` voi Guest va Cloud; dam bao khong trung diem danh.
- Guest nhan ngay that -> +1 `d_login`, +1 weekly va monthly; bu 2 o -> tru 50 roi 150 gems, 2 counter van khong tang; khong cho bu ngay hom nay, ngay tuong lai, ngay da nhan.
- Cloud thu 2 lan `attendance.claim`, 2 lan `attendance.makeup`, `mission.claim` lap lai; API phai tu choi duplicate va giu so du tai khoan dung.
- UAT vao ngay 28/02/2027, 29/02/2028 va 30/10/2026, kiem tra UI muc tieu va nhan mission Cloud tren backend.
- Qua thang moi/tuan moi, xac nhan counter reset dung va khong backfill streak; tiep tuc choi Campaign 3 tran va 30 stage wins; Dungeon khong tang `d_play_3`.
- Khi cap nhat ban ghi nguoi choi, doi chieu UID, so du, items, equipment, event history truoc/sau.
