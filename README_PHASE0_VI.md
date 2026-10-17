# SPACE FIGHTER 4.0 — PRODUCTION FOUNDATION, PHASE 0

**Phiên bản source:** `1.0.1-phase0.0`  
**Ngày tạo:** 16/10/2026  
**Gốc:** `spaceFighter.zip` SHA-256 `1bdc8f2751f87d34475ae1ee939a7a3780be0ab2d6689a66f7460f78de3fb2a3`.

> Đây là bản **NỀN TẢNG chuẩn bị cho production**, KHÔNG PHẢI bản được phép phát hành thương mại ngay. Thanh toán bằng tiền thật **đã được tạm khóa có chủ đích**, vì chưa có backend xác thực và cấp vật phẩm.

## 1. Cấu trúc bàn giao

- `client/` — React 18, Babylon.js, giao diện chiến dịch/phó bản, Firebase Auth/Firestore, native Capacitor Android/iOS.
- `server/` — Node.js/Express, phục vụ web bundle và `/ping`, `/health`; **không có API phát thưởng hoặc PvP thực sự**.
- `docs/` — bảng thay đổi, checklist, test report và giới hạn/việc chưa hoàn thành.
- `.github/workflows/phase0-ci.yml` — CI: cài phụ thuộc, test, audit và thử build production web.

Bản FULL SOURCE loại bỏ `node_modules/` (>500 MiB sau giải nén) và `client/client.7z` (gói source cũ lồng vào), vì sẽ gây trùng lặp/lỗi native binary theo hệ điều hành. Không mất mã nguồn nghiệp vụ. Không kèm `.env`, keystore, tài khoản Firebase hay sản phẩm đã build để phát hành.

## 2. Những thay đổi đã áp dụng

1. **Khóa IAP fail-closed**: `client/src/components/ShopCampaign/index.jsx` không chạy thanh toán, không cấp kim cương từ lỗi giao dịch/đường test; hiển thị rõ đang tạm khóa. Chưa có RevenueCat fulfillment server thì không được mở lại.
2. **Đồng bộ dữ liệu có schema**: `client/src/utils/profileSchema.js` (mới) hỗ trợ lưu/khôi phục `materials.crates`, `eventData`, `dungeonHistory`, và dữ liệu người chơi cũ. Dùng `mergeFields` để giữ nguyên các trường Firestore khác không do gameplay quản lý, đồng thời cho phép xóa vật phẩm đã bán. Lưu ý: các map nghiệp vụ do client quản lý vẫn được thay thế trọn vẹn.
3. **Sửa khởi tạo user mới**: `useAuth.jsx` truyền rõ user xác thực vào save, tránh React closure cũ ghi vào dữ liệu khách. Các thao tác save từ cùng phiên được xếp tuần tự để giảm race do mạng.
4. **Lưu guest tương thích ngược**: xử lý cả dữ liệu dạng object và JSON string; truy cập localStorage lỗi sẽ không làm crash giao diện. Loại bỏ thao tác ghi plaintext trái luồng trong `CampaignScene.js`.
5. **Reset điểm danh theo tuần**: `attendanceWeek.js` dùng tuần bắt đầu Thứ Hai (theo ngày giờ địa phương) và có migration tối thiểu cho dữ liệu cũ; chặn điểm danh bù ngày tương lai.
6. **Trừ năng lượng phó bản**: trong `HQ/index.jsx`, kiểm tra số dư, chặn double-click, lưu trước khi chuyển tới gameplay; nếu lưu thất bại thì khôi phục năng lượng RAM. Với trạng thái offline, lời gọi Firestore có thể chờ tới khi kết nối được phục hồi.
7. **Server Express an toàn hơn**: không cần Firebase Admin credentials để phục vụ web, `/ping` giữ nguyên, thêm `/health`, header cơ bản, trả 503 nếu chưa có `client/dist`.
8. **Android/PWA**: bỏ dòng apply Google Services trùng trong Gradle; giữ nguyên App ID chưa đồng nhất vì không thể đổi tùy tiện; sao chép icon WebP vào `public/icons/` và sửa manifest để icon thực sự có trong bản build.
9. **Tooling**: unit test, static invariant tests, import audit, asset audit, App ID audit và CI GitHub Actions.

## 3. Chạy trên Windows (PowerShell / CMD)

Yêu cầu Node.js 22 (khuyến nghị), npm 10+, Git nếu sử dụng CI. Trong thư mục FULL SOURCE:

```powershell
cd client
npm ci
npm run check:phase0
npm run dev
```

Build Web:

```powershell
cd client
npm run build
```

Chạy server sau khi đã build client:

```powershell
cd server
npm ci
npm test
npm start
```

Máy không có Internet để chạy `npm ci`: có thể giữ lại `node_modules` nguyên trạng từ thư mục project cũ **trên cùng hệ điều hành và kiến trúc**, nhưng nên chạy lại `npm ci` khi có mạng. Không chép thư viện Windows sang Linux. Native Android/iOS cần đúng Android Studio/Xcode, keystore và cấu hình dịch vụ; CI hiện chỉ build bundle Web.

## 4. Nếu dùng gói PATCH ONLY

1. Sao lưu thư mục project hiện tại và **export Firestore** trước khi cập nhật bất kỳ client nào đã kết nối DB thực.
2. Giải nén PATCH ONLY vào **thư mục gốc đang có hai thư mục `client/` và `server/`**; cho phép ghi đè đúng những file trong patch.
3. Không xóa `node_modules` hiện tại khi chỉ overlay patch. Nếu thay đổi nền tảng hoặc gặp lỗi package, chạy lại `npm ci`.
4. Chạy `npm run check:phase0` và `npm run build` trong `client/`; chạy `npm test` trong `server/`.
5. Thực hiện checklist test thủ công tại `docs/PHASE0_TEST_REPORT_VI.md` trên Firebase test/staging **trước khi chạm vào dữ liệu thật**.

Các file nào thay đổi được liệt kê chi tiết trong `docs/CHANGE_MANIFEST.json`. Bản PATCH ONLY **không thay thế** source đầy đủ của ứng dụng.

## 5. Cài Firebase và Mobile

- `src/firebase.js` chấp nhận `VITE_FIREBASE_*` (xem `client/.env.example`). Nếu không khai báo, mã nguồn giữ **giá trị cấu hình Firebase Web công khai của dự án cũ** nhằm tránh đứt đăng nhập khi nâng cấp. Đây là định danh công khai, **không phải Firebase Admin secret**. Không sao chép tài khoản production sang môi trường test.
- `client/android/app/google-services.json` không có trong file ZIP nguồn ban đầu. Hãy cung cấp từ **đúng** ứng dụng Firebase Android đã đăng ký trước khi build native.
- `client/capacitor.config.ts` dùng `com.ban.astrocat`; Android Gradle dùng `com.theIT.spacefighter4`, iOS Xcode dùng `com.ban.astrocat`. **Chưa đổi App ID**. Cần chốt danh tính app với thông tin Google Play/App Store/Firebase trước khi `cap sync` hoặc phát hành.
- `VITE_STORAGE_KEY` chỉ mã hóa cache guest ở phía client; **không chống sửa dữ liệu, không phải bí mật server**. Tránh thay đổi key trên người chơi cũ nếu chưa có migration.

## 6. Những điều kiện bắt buộc trước khi được gọi là production

Xem `docs/RELEASE_BLOCKERS_VI.md`: Firestore Rules/backend authority, giao dịch IAP được xác thực, vấn đề chống gian lận và concurrency đa thiết bị, 61 tham chiếu asset thiếu, App ID, kiểm thử thiết bị thật, kiểm tra giấy phép asset và quy trình khôi phục dữ liệu. Lệnh `npm run check:release` sẽ cố ý FAIL trong trạng thái hiện tại khi còn các cảnh báo release.

**Không triển khai patch thẳng vào môi trường người chơi thật khi chưa có backup và kiểm thử UAT.**
