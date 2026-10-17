# PHASE 1 — BÁO CÁO KIỂM THỬ MÃ NGUỒN

**Ngày:** 16/10/2026  
**Phạm vi:** Mã nguồn Phase 1 kế thừa từ Phase 0, không có kết nối thực đến máy chủ Firebase/Apple/Google Store.

## 1. Kết quả đã chạy

| Nhóm | Lệnh | Kết quả |
|---|---|---|
| Client unit regression | `cd client && npm test` | **10 PASS / 0 FAIL** |
| Client security static | `cd client && npm run check:safety` | **14 PASS / 0 FAIL** |
| Client import audit | `cd client && npm run check:imports` | **31 source JS/JSX, 78/78 import hợp lệ** |
| Server pure logic/service | `cd server && npm test` | **17 PASS / 0 FAIL**, thêm **3 Express tests SKIP** |
| Parser JS/JSX | Babel parser trên 31 file client/src | **31/31 PASS** |
| Asset audit | `cd client && npm run audit:assets` | **61 tham chiếu thiếu, WARN / release blocker** |
| Config audit | `cd client && npm run audit:config` | **App ID mismatch + thiếu google-services.json, WARN** |

## 2. Kiểm thử bảo mật thực hiện được

- Không còn API mutation `setDoc/updateDoc/deleteDoc` trong mã nguồn JS/JSX client.
- Server yêu cầu Firebase ID token và `X-Game-Session`; lệnh cloud sử dụng transaction.
- Replay cùng requestId/payload trả kết quả idempotent, replay khác payload bị từ chối.
- UID/session cũ không thể sửa profile khác; người không có session bị từ chối.
- Gacha tính phí server, random từ Node crypto RNG, không nhận item/balance do client định giá.
- Trừ năng lượng phó bản trong transaction ngay khi bắt đầu ticket; một ticket không thể dùng để nhận hai lần.
- Sao, stage, daily cap và hạn mức nhận thưởng được server kiểm tra; số kill client báo không làm tăng nhiệm vụ kill.
- Điểm danh một ngày không thể lấy hai lần; reset tuần dùng UTC; lastDate legacy có chuyển đổi streak.
- Hồ sơ legacy giữ eventData, dungeonHistory và crates sau command; cloud user không còn tự viết wallet.

## 3. Đã tạo nhưng chưa xác nhận

- **Express integration tests (3 bài): SKIP** do môi trường phân tích thiếu package `express`, `dotenv`, `firebase-admin`; chạy được khi `npm ci`.
- **Vite web build:** chưa chạy được với dependency hiện tại; cần chạy trên Windows/CI chuẩn.
- **Firestore Security Rules:** mới kiểm tra chuỗi/quy tắc tĩnh, chưa có Emulator hoặc thử quyền với người dùng thật.
- **Android/iOS native:** chưa build/sign/đăng nhập/đo hiệu năng.
- **Concurrency Firestore thật:** mock transaction test đã chạy, không thay thế concurrency test với emulator hoặc cloud.
- **IAP/Store:** không test thanh toán thật vì IAP vẫn khóa.
- **PvE anti-cheat:** chưa xác thực server thực sự thắng trận; kiểm tra timing/daily limit chỉ hạn chế lạm dụng.

## 4. Lệnh kiểm thử dành cho bạn

```powershell
cd client
npm ci
npm run check:phase1
npm run build
npm run check:release # Dự kiến FAIL cho tới khi khắc phục asset/config

cd ..\server
npm ci
npm test
npm start
```

**Kết luận:** Đạt tiêu chuẩn **source-level UAT candidate** cho Phase 1, **chưa đạt production gate**.
