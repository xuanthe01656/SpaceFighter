# SPACE FIGHTER 4.0 — PHASE 1 V1.1.0 (SECURITY FOUNDATION / UAT)

**Nguồn nâng cấp:** Space Fighter Phase 0 V1.0.0 (`spaceFighter_Phase0`), không thay engine React/Babylon.js.  
**Ngày:** 16/10/2026  
**Trạng thái:** MÃ NGUỒN + UNIT TEST HOÀN THÀNH, **CHƯA PHẢI BẢN ĐƯỢC DUYỆT PHÁT HÀNH THƯƠNG MẠI**. Chưa kiểm thử Firebase thực tế, Android/iOS release hoặc combat anti-cheat.

## A. Đã thay đổi thực tế

1. **API Node/Express có xác thực** `/api/v1/session`, `/api/v1/profile`, `/api/v1/command`, `/api/v1/profile/name`, `/api/v1/account/delete`. Mọi request liên quan tài nguyên yêu cầu Firebase ID token và session ID hợp lệ. Một phiên mới sẽ vô hiệu hóa phiên trước.
2. **Firestore authority**: `server/lib/gameService.cjs` đọc/sửa hồ sơ bằng transaction; commands có `requestId`, tạo sổ cái `users/{uid}/operations/{requestId}` bằng `t.create()`, xử lý lệnh trùng mà không trừ/cấp thưởng hai lần. Client tự truyền số dư/loot không có tác dụng.
3. **Engine kinh tế** `server/lib/economy.cjs`: phí và RNG gacha từ catalog server; kiểm tra vật phẩm sở hữu khi nâng cấp/hiến tế/bán/khóa/trang bị; xử lý điểm danh, nhận thưởng nhiệm vụ/sự kiện; ticket bắt đầu/kết thúc/rút lui chiến đấu; trừ energy và trả thưởng bằng transaction; giới hạn theo ngày để giảm thiểu lạm dụng. Nhiệm vụ kill không cộng từ số liệu client tự khai.
4. **Client** `client/src/services/gameApi.js`, `hooks/useAuth.jsx`: dùng server cho hồ sơ và các thao tác kinh tế có đăng nhập, có retry cùng requestId nếu timeout. Chế độ guest vẫn hoạt động cục bộ (không phải cơ chế lưu dữ liệu thương mại).
5. **Tích hợp trang màn hình** HQ, campaign, dungeon, dungeon result, Inventory, Pilots, Missions, Events, Attendance, ShopCampaign, Portal. Sửa luồng nhận thưởng sau khi thắng dungeon trên tài khoản cloud; có cơ chế đóng vé trận cũ trước trận mới trong HQ.
6. **Security Rules** `security/firestore.rules`: chỉ cho chủ tài khoản đọc `users/{uid}`, client không thể ghi game state hoặc xem operation ledger. Server Admin SDK có quyền ghi qua bypass Rules. **Cần phối hợp chuyển đổi, KHÔNG deploy Rules vào hệ thống đang có client Phase 0 hoạt động.**
7. **CI**: Giữ tên workflow `.github/workflows/phase0-ci.yml` nhưng đã chuyển toàn bộ sang bộ kiểm thử Phase 1 để PATCH ONLY ghi đè workflow Phase 0 cũ mà không tạo workflow chạy trùng.
8. **IAP**: vẫn khóa có chủ đích. Không có logic chứng thực hóa đơn; tuyệt đối không bật qua cấu hình riêng của frontend.

## B. Cấu trúc mới

```text
SpaceFighter/
  README_PHASE1_VI.md
  firebase.json
  security/firestore.rules
  server/server.js                    API auth + static host + /health
  server/lib/economy.cjs             Quy tắc kinh tế server
  server/lib/gameService.cjs         Firestore transaction + ledger
  server/tests/economy.test.cjs      Test chống gian lận/idempotency
  client/src/services/gameApi.js     API có token + session
  client/src/hooks/useAuth.jsx       Đồng bộ profile chuẩn server
  client/scripts/check-phase1-security.mjs
  docs/PHASE1_SECURITY_TEST_REPORT_VI.md
  docs/PHASE1_MIGRATION_RUNBOOK_VI.md
  docs/PHASE1_KNOWN_LIMITATIONS_VI.md
```

## C. Chạy UAT trên máy Windows (KHÔNG dùng ngay production)

**Điều kiện**: Node.js 20+, npm, Firebase project **staging** với Authentication (Google/Apple tùy nền tảng), Firestore và quyền Admin dành riêng cho máy chủ. Hai thư mục `client/` và `server/` cần giữ vị trí tương đối như gói FULL SOURCE vì backend cùng dùng game catalogs và schema. **Không đặt service-account JSON hoặc private key trong client/public, APK hay repository.**

Sử dụng 2 cửa sổ PowerShell, ở thư mục dự án:

**Cửa sổ A — server**

```powershell
cd server
Copy-Item .env.example .env
# Sửa FIREBASE_PROJECT_ID, GAME_ALLOWED_ORIGINS trong .env
# Dùng Application Default Credentials tại server, ví dụ:
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\secure\staging-service-account.json"
npm ci
npm test
npm start
```

Kiểm tra `http://localhost:3000/health`, JSON phải có `"phase":1,"apiReady":true`. Nếu `apiReady:false`, **không tiếp tục kiểm thử cloud**; kiểm tra `.env`, quyền Firebase Admin và `GAME_API_ENABLED=true`.

**Cửa sổ B — client**

```powershell
cd client
npm ci
npm run check:phase1
npm run build
npm run dev
```

Mở `http://localhost:5173`, trình dev proxy chuyển `/api` sang `http://localhost:3000`. Đăng nhập bằng người dùng thử nghiệm trên Firebase staging. Với native, build phải cấu hình `VITE_GAME_API_URL=https://<server-cua-ban>/api/v1`, server phải có TLS thật, CORS `GAME_ALLOWED_ORIGINS` phải chứa origin của app tương ứng. Không tự chuyển ID ứng dụng Android/Capacitor khi chưa chốt chiến lược migration.

> `check:phase1` kiểm tra mã nguồn; `check:release` có kiểm tra asset/config strict, **sẽ còn FAIL cho tới khi bổ sung tài nguyên, App ID, google-services.json**. Đây là điều kiện chặn phát hành có chủ ý.

## D. Đưa lên Firebase

**Cảnh báo**: `security/firestore.rules` là bản mẫu **deny by default cho game-only Firebase project**. Nếu dự án Firebase chia sẻ cùng ứng dụng khác, phải **merge** Rules vào bản đang có, không ghi đè toàn bộ! Rules mới sẽ chặn các phiên bản client Phase 0 ghi Firestore trực tiếp. Đọc từng bước bắt buộc ở `docs/PHASE1_MIGRATION_RUNBOOK_VI.md` trước khi chạy bất kỳ lệnh triển khai nào.

Chỉ sau khi đã UAT staging và có bản sao Rules, DB cùng phương án ngừng phiên bản cũ, mới dùng Firebase CLI với project ID được xác định tường minh:

```powershell
firebase deploy --only firestore:rules --project YOUR_STAGING_PROJECT_ID
```

**Không chạy lệnh trên với production Firebase của bạn khi chưa hoàn thành checklist.**

## E. Kiểm thử hiện có và giới hạn

- Server: 17 bài test pure logic/service PASS, 3 bài tích hợp Express **SKIP do môi trường chưa có npm dependency**.
- Client: 10 unit PASS, 14 kiểm tra tĩnh an toàn PASS, 78/78 import nội bộ đúng, 31 file JS/JSX parse Babel PASS.
- Chưa chạy được `npm run build` / Android release / iOS release / Firebase Emulator security rules / staging real.
- Còn 61 tham chiếu hình ảnh tĩnh bị thiếu; App ID Android khác Capacitor; chưa có `google-services.json`; IAP bị khóa.
- **Giới hạn an ninh quan trọng**: PvE vẫn do Babylon client chạy và gửi kết quả thắng/thua. Ticket, thời lượng, cooldown và daily cap **KHÔNG chứng minh thắng trận thật**. Game thương mại có tài nguyên giá trị cần bổ sung trusted combat verification, anti-abuse telemetry hoặc server-authoritative battle.
- Các tên player chưa có reservation unique toàn cục. Nhiệm vụ `d_kill_50` chưa xác minh server nên không thể nhận tiến độ từ số kill client gửi. Một số mốc sự kiện cũ đã hết hạn.

**Rollback**: không tự động phục hồi Rules/DB. Không được copy client Phase 0 ngược lại mà vẫn giữ deny-write Rules Phase 1 (client Phase 0 sẽ mất lưu cloud). Làm theo `docs/PHASE1_MIGRATION_RUNBOOK_VI.md`.
