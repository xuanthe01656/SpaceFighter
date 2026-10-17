# Space Fighter Graphics 2.1.2 — Mission Sync Migration (test account)

**Baseline:** FULL SOURCE Graphics 2.1.1 + Mission Sync Hotfix. **Phạm vi:** hướng X-Wing, bằng chứng điểm danh thật UTC, đối soát một trường hợp dữ liệu test cũ. Không thay cấu hình Firebase, Firestore Rules, model GLB, ví/kim cương, inventory, hoặc lịch sử nhận thưởng.

## 1. Các thay đổi có kiểm soát

- Sprite X-Wing: `spriteInvertY:true` trong `client/src/constants.js` được dùng bởi `ShipVisualFactory` khi nạp PNG trên nhánh mobile/Responsive; không lật các tàu khác. Cần UAT trực quan trong Chrome Pixel 10.
- GLB X-Wing: sửa `modelRotation.y` trở về `+Math.PI/2` vì mặc định Babylon left-handed đã chuyển hệ tọa độ của glTF qua node `__root__` (180 độ Y và scale Z âm). Không can thiệp collider / hướng bắn.
- Nhiệm vụ Cloud: server ghi `attendance.naturalClaimDaysUTC` từ `attendance.claim` thật **sau khi giao dịch thành công**, giới hạn 75 ngày gần nhất, không ghi ngày mới với `attendance.makeup`. `updateMissions()` dùng ledger để khôi phục **mức sàn có bằng chứng**, không tự suy luận ngày từ streak hoặc makeup.
- Các operation `attendance.claim`/`attendance.makeup` mới có `extra.attendance.kind`, `dayUTC`, riêng makeup có `weekday`, phục vụ audit. Khóa idempotency hiện có được giữ nguyên.
- Guest tương ứng ghi ngày điểm danh thật ở local save và giữ bộ đếm sau reset dựa trên ledger. Guest không được dùng làm bằng chứng Cloud.

## 2. Dữ liệu Cloud cũ của tài khoản test

Snapshot đã được người dùng xác nhận tại Firestore: `attendance.claimedDays:[1,2,5]`, `makeupCount:2`, `lastDate:"Fri Oct 16 2026"`, `lastClaimUTC` không có; `missions.progress` ngày=0, tuần=2, tháng=0; missionKeys: tuần 2026-10-12, tháng 2026-10. `operations` có hai `attendance.makeup`, **không có** `attendance.claim`.

**Không đủ bằng chứng tự động suy ngày UTC** vì `lastDate` là lịch địa phương cũ và không có thời điểm giao dịch. Dưới đây là thủ tục sửa *chỉ cho dữ liệu test một tài khoản*, khi người vận hành xác nhận thủ công lượt điểm danh thật thuộc **ngày UTC 2026-10-16**. Công cụ không tự sửa Cloud trên khi chỉ cài PATCH.

Nếu chạy trong cùng tuần UTC 2026-10-12..2026-10-18, sửa về tuần=1, tháng=1. Nhiệm vụ ngày=0 nếu tại thời điểm chạy đã là ngày UTC 2026-10-17; **không nhận lại nhiệm vụ ngày đã hết kỳ**. Mọi lần reset tương lai được bảo toàn qua ledger. Không thay số dư, ô bù, vật phẩm, claim reward, UID, `sessionId`.

## 3. Triển khai trên Windows / CMD

### A. Áp PATCH và kiểm thử

Giải nén `SpaceFighter_Graphics2.1.2_MissionSync_PATCH_ONLY.zip` vào **thư mục gốc** `C:\Users\TVH01374\Desktop\SpaceFighter`, chọn ghi đè. PATCH dựa trên **bản Graphics 2.1.1**, không áp lên V1.2.1 gốc.

Terminal Server:

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\server
npm ci
npm test
npm start
```

Terminal Client (mở riêng):

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\client
npm ci
npm test
npm run check:graphics21
npm run build
npm run dev
```

**Không dùng** `npm install --force`, không xóa Firestore, không đặt Service Account JSON trong project public. `/health` phải báo `apiReady:true`. Kiểm thử Browser WebGL thực tế phải làm trên máy có GPU và npm dependencies.

### B. Dry-run khôi phục *chỉ* tài khoản test đã nêu

Tạm thời **không điểm danh thêm hoặc dùng tính năng Cloud khác** để giữ đúng mẫu dữ liệu hiện tại. Trong **CMD của server** đang cấu hình `FIREBASE_PROJECT_ID` và Firebase Admin SDK (dùng cùng credentials như server đang chạy):

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\server
node scripts\repair-legacy-attendance.cjs --uid "UID_CUA_TAI_KHOAN_TEST" --day 2026-10-16 --expect-makeups 2
```

Đây là thao tác chỉ đọc. Kết quả phải có `mode: READ_ONLY_DRY_RUN`, `status: READY`, đúng Firebase project, `preview.old.weekly:2`, `preview.next.weekly:1`, `preview.next.monthly:1`, và giá trị `fingerprint` SHA-256. Nếu `BLOCKED` hoặc khác mẫu **dừng**, không tự chỉnh Firestore để lách điều kiện.

Sau khi kiểm tra đủ và xác nhận **ngày điểm danh thật là 16/10 theo UTC**, dùng fingerprint từ đúng lần dry-run vừa chạy để cho phép một lần ghi:

```bat
set ALLOW_TEST_PROFILE_REPAIR=true
node scripts\repair-legacy-attendance.cjs --uid "UID_CUA_TAI_KHOAN_TEST" --day 2026-10-16 --expect-makeups 2 --apply --fingerprint "DAN_GIA_TRI_SHA256_64_KY_TU_VAO_DAY"
set ALLOW_TEST_PROFILE_REPAIR=
```

Kết quả cần có `APPLIED_ONE_PROFILE` và `SUCCESS`. Script mở transaction, đọc lại snapshot và kiểm tra fingerprint trước khi ghi **chỉ hai map `attendance` và `missions`**. Bất kỳ thay đổi concurrent nào đều khiến nó từ chối ghi. Chạy lại sẽ báo `ALREADY_REVIEWED` chứ không cộng lần hai.

Nếu bạn không biết UID: tìm từ đường dẫn tài liệu hiện tại trong Firebase Console `users/{uid}` và **chỉ sử dụng ở máy bạn**, không gửi lên chat.

**Hết thời hạn:** Script có chủ ý chặn nếu đã sang tuần khác UTC (sau 00:00 UTC thứ Hai 19/10, tức 07:00 Việt Nam) hoặc tháng khác. Đó là để không chỉnh điểm tuần đã hết hạn, không phải lỗi. Khi đó cần yêu cầu kế hoạch đối soát riêng cho dữ liệu lúc đó. Script cũng chặn nếu tài khoản đã điểm danh UTC mới, mission đã claim, không còn đúng snapshot hoặc ngày 16/10 thực ra chưa được xác nhận là ngày UTC.

### C. Kiểm thử sau apply

1. Mở lại game (F5, đăng nhập lại nếu session hết hạn).
2. Firestore `attendance.naturalClaimDaysUTC` phải chứa `"2026-10-16"`; `attendance.lastClaimUTC` tương ứng; `claimedDays` vẫn `[1,2,5]`, makeupCount vẫn 2.
3. `missions.progress.w_login_5` = 1, `m_login_30` = 1. `d_login` là 0 vào ngày 17/10 nếu chưa điểm danh ngày 17/10.
4. Điểm danh thật cho ngày UTC mới (nếu chưa) sẽ tăng các nhiệm vụ phù hợp đúng 1, không mất `wallet`, inventory, lịch sử điểm danh.
5. Kiểm tra `operations` có một `attendance.claim` mới có `extra.attendance.kind:"natural"` và ngày UTC chính xác.
6. Trong Chrome F12 / Device Toolbar chọn Pixel 10, vào Campaign chụp ảnh X-Wing. Mũi phải hướng về phía kẻ địch (-Z), đuôi/engine flame ở phía người chơi (+Z). Đổi User-Agent/thiết lập thử Desktop GLB, chờ 57 MB model tải xong và kiểm tra tương tự, cả Campaign và Dungeon.

## 4. Những nội dung chưa chứng minh production-ready

- **Chưa chạy được Babylon WebGL/Vite build** tại môi trường tạo patch vì registry npm không kết nối; phải hoàn tất trên Windows có dependencies, kiểm tra thực tế bằng ảnh.
- PvE hiện vẫn dựa vào phần báo cáo thắng từ client với ràng buộc hạn mức server. Điều này **chưa phải authoritative combat** đủ an toàn cho economy thương mại; phải thiết kế xác minh combat/anti-cheat trước phát hành.
- Cần audit IAP/RevenueCat/biên lai, bảo mật Cloud, CI/CD, migration/backfill ngoài một fixture test, tải 57 MB GLB trên desktop, kiểm thử tải và hiệu suất. Đây là công việc tiếp theo, không phải những gì bản 2.1.2 đã hoàn tất.
