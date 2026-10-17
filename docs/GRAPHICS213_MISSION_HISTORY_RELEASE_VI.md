# Graphics 2.1.3 + Firebase Mission History Reconcile (VI)

**Baseline bắt buộc:** SpaceFighter Graphics 2.1.2 + Mission Sync Migration. Bản cập nhật không xóa Firebase, không đổi Firestore Rules, không can thiệp số dư và tài khoản Google. Đây là bản vá tăng tính nhất quán và công cụ đối soát, **không phải chứng nhận production-ready**.

## 1. X-Wing Desktop: vấn đề thực tế và quyết định

Ảnh chạy thực tế cho thấy mũi tàu GLB hướng lên nhưng model trông khác biệt về hình dáng, màu sắc so với sprite xanh-trắng X-Wing (model gốc 57.76 MB, khoảng 1.87 triệu tam giác). Đây là lệch **chất lượng/mỹ thuật model**, không thể sửa bằng cách xoay thêm 180 độ.

`chooseShipRenderQuality()` giờ chọn sprite X-Wing chuẩn mặc định ở **desktop + mobile** khi model quá nặng (>8 MiB hoặc >150k tam giác). GLB gốc vẫn được giữ nguyên và có thể kiểm thử bằng cách **chủ động** gọi `createPlayerShipVisual(..., {quality:'auto'})` trong môi trường phát triển; gameplay mặc định không phát tải 57.8 MB. Không sửa collider, sát thương, hướng bắn hoặc quyền sở hữu tàu. Khi có model tối ưu đúng art/axis, cần bổ sung screenshot/WebGL/UAT để bật lại 3D.

## 2. `weeklyCompletedDays`, `streak`, `w_login_5`

- `attendance.weeklyCompletedDays`: số ô tuần đã đánh dấu (gồm **cả ngày thật và bù**); dùng cho tiến trình đủ 7 ô thưởng tuần.
- `attendance.streak`: chuỗi **ngày thật liên tiếp**, không tăng vì điểm danh bù.
- `missions.progress.w_login_5`: số **ngày thật hợp lệ trong tuần UTC**, tối đa 5; **khác `weeklyCompletedDays`**.
- `attendance.weeklyStreak`: **legacy mirror**, giữ lại và cập nhật bằng số ô để người dùng phiên bản cũ đọc được. Đừng xóa khi còn client cũ.

## 3. Dữ liệu Firebase cũ: những gì khôi phục được

Kỳ được tính theo **UTC**, tuần bắt đầu Thứ Hai; mục tiêu điểm danh tháng = `min(30, số ngày trong tháng UTC)`.

- Nếu trong `users/{uid}.missions` có bộ đếm/claimed của **đúng kỳ UTC hiện tại**, **giữ lại**, không tự reset khi chỉ mở Missions.
- Nếu `attendance.naturalClaimDaysUTC` đã chứa ngày thật, server phục hồi các mốc ngày/tuần/tháng tương ứng; nay khi GET profile cũng hiển thị mốc đủ bằng chứng **không ghi Firestore**.
- Tool `server/scripts/reconcile-cloud-missions.cjs` đối chiếu `users/{uid}` và `operations` (lọc theo ngày từ đầu tháng/tuần UTC đến hiện tại). Giao dịch `attendance.claim` ở server có `createdAt` hợp lệ được tính là ngày thật duy nhất; `attendance.makeup` KHÔNG tính.
- Giao dịch gacha cũ có `extra.pulls` có thể khôi phục `m_pull_gacha`; giao dịch server mới có `extra.missionDeltas` được dùng khôi phục các mốc nhiệm vụ tương ứng theo khóa UTC. **Không cộng hai lần** `extra.pulls` nếu đã có `missionDeltas`.
- Các bộ đếm cũ không có bằng chứng độc lập được **giữ nguyên nếu cùng kỳ**; không tự hạ giá trị, không phát lại thưởng. `battle.finish` cũ không có thông tin mode/finish có thể chứng thực để khôi phục Campaign/Boss, do đó báo `legacyWarnings` cho operator thay vì tự bịa kết quả.
- Mỗi kỳ kết thúc được lưu snapshot `missions.periodHistory` giới hạn (ngày/tuần/tháng), chỉ để kiểm toán. Dữ liệu legacy không có khóa kỳ được lưu `missions.legacyUnkeyed`, **không** tự tính vào kỳ hiện tại. Hiện giao diện Missions hiển thị **kỳ hiện tại**, không có tab duyệt lịch sử cũ.
- **Không có cách tự tạo các ngày điểm danh, trận thắng, tiến trình quá khứ chưa từng được ghi nhận.** Một số lịch sử phiên bản cũ phải được đối soát thủ công với nguồn độc lập (nếu còn).

## 4. Cài PATCH trên Windows

1. Tắt client và server (`Ctrl + C`). Giải nén **PATCH_ONLY 2.1.3** vào `C:\Users\TVH01374\Desktop\SpaceFighter`, cho phép ghi đè. **Chỉ áp lên FULL SOURCE 2.1.2**; không áp thẳng lên V1.2.1.
2. Không ghi đè `.env` hay credential; file PATCH không chứa những file này.
3. CMD Server:

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\server
npm ci
npm test
npm start
```

4. CMD Client:

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\client
npm ci
npm test
npm run check:graphics21
npm run build
npm run dev
```

Kiểm tra `http://localhost:3000/health` phải trả `apiReady: true` để Cloud hoạt động. Chrome Ctrl+F5, chuyển Device Toolbar OFF, vào Campaign: X-Wing phải giống hướng và màu sắc của bản mobile và mũi hướng lên. Vào Dungeon kiểm tra tương tự.

## 5. Dry-run một tài khoản (không ghi gì)

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\server
node scripts\reconcile-cloud-missions.cjs --uid "UID_TAI_KHOAN_TEST"
```

Xem `projectId`, `status`, `fingerprint`, `preview.old`, `preview.next`, `preview.verifiedNaturalDays`, `preview.legacyWarnings`. Nếu `READY` và phù hợp dữ liệu thực tế, trên cùng máy/server `.env`:

```bat
set ALLOW_TEST_MISSION_REPAIR=true
node scripts\reconcile-cloud-missions.cjs --uid "UID_TAI_KHOAN_TEST" --apply --fingerprint "SHA256_64_KY_TU_TU_DRY_RUN"
set ALLOW_TEST_MISSION_REPAIR=
```

Kết quả `APPLIED` rồi dry-run lại phải `NO_CHANGES` (hoặc `READY` nếu đã phát sinh operation mới trong kỳ; cần đối chiếu). `CONFLICT`/`BLOCKED` là dừng đúng thiết kế, **không dùng fingerprint cũ hoặc sửa Firestore bằng tay**.

## 6. Kiểm kê và đối soát **mọi** người chơi hiện có (operator)

Bước 1 — đọc toàn bộ profile theo trang, tối đa 1000 tài khoản/lần (có thể điều chỉnh), mỗi tài khoản kiểm tra tối đa 500 operations từ đầu tháng/tuần UTC:

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\server
node scripts\reconcile-cloud-missions.cjs --all --max-users 1000 --output "..\mission_audit_213.json"
```

Không sửa dữ liệu. JSON report chứa UID và số liệu profile, chỉ giữ **ở máy người vận hành**; không đưa vào repo hoặc gửi công khai. Xem danh sách `status: READY`, `BLOCKED`, `NO_CHANGES`, `preview.legacyWarnings` và các mốc tuần/tháng. Nếu `reachedEnd: false`, dùng `nextStartAfter` ở report để tiếp tục trang sau (tạo tên report mới). Nếu báo quá 500 operations/tài khoản, công cụ **BLOCKED** để tránh đối soát từ lịch sử bị cắt.

Bước 2 — chỉ sau khi xem report và chấp nhận các thay đổi, có thể áp dụng đúng các tài khoản `READY` trong file, **không bắt buộc**; mọi thay đổi có fingerprint/transaction để chặn race:

```bat
set ALLOW_TEST_MISSION_REPAIR=true
node scripts\reconcile-cloud-missions.cjs --apply-report "..\mission_audit_213.json" --confirm-project distributed-inn-482605-c6 --allow-bulk
set ALLOW_TEST_MISSION_REPAIR=
```

Tool cập nhật **chỉ** `attendance` và `missions`. Tài khoản thay đổi trong lúc review sẽ có `CONFLICT` và bị bỏ qua. Không reset Firebase Auth, không đụng `wallet`, inventory, `sessionId`, hoặc `operations`. Lưu ý chi phí đọc Firestore tùy số user/operations; dữ liệu lớn cần chia trang và giám sát.

## 7. Báo cáo kiểm thử trong môi trường tạo patch

- Server `node --test tests/*.test.cjs`: **42 PASS, 3 SKIP** (3 bài HTTP vì thiếu dependencies tại môi trường build).
- Client Node tests không có Babylon: **45 PASS**; `npm test` đầy đủ bị thiếu `@babylonjs/core` tại môi trường tạo patch nên 1 file test NullEngine không khởi tạo được. **Phải chạy lại trên Windows sau npm ci**.
- Graphics static `12/12`, Phase 1 security static `14/14`, Phase 2 gameplay static `14/14`, relative imports `109/109`.
- Module reconcile riêng PASS khi chạy `TZ=UTC`, `Asia/Ho_Chi_Minh`, `Pacific/Honolulu`, `Pacific/Kiritimati`.
- Chưa chạy E2E Firebase Admin trên project của bạn, Vite build, Browser WebGL hoặc benchmark FPS ở môi trường này. Đặc biệt không có bằng chứng tương đương kiểm thử giao dịch trên dữ liệu Cloud sống. Phải làm UAT sau cài đặt.

## 8. Phạm vi production còn thiếu

Game **chưa thể chứng nhận production-ready**: combat PvE server chưa mô phỏng xác minh thắng thua hoàn toàn, IAP/RevenueCat cần xác thực đầy đủ ở backend, cần FPS/LOD art chuẩn, security/performance/load testing, và quan sát production. Mission migration có audit nhưng không thể phục hồi sự kiện chưa từng lưu.
