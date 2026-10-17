# SPACE FIGHTER 4.0 — PHASE 2 V1.2.0 (GAMEPLAY FOUNDATION)

**Baseline:** Phase 1 V1.1.0 đã áp **Windows ESM Hotfix H1** và **Attendance Timezone Hotfix H2**.
**Ngày bàn giao:** 16/10/2026.
**Loại bản:** nguồn UAT / phát triển, **KHÔNG PHẢI** bản đã đạt production thương mại.

## I. Phạm vi được nâng cấp

1. **Chỉ số chiến đấu thống nhất:** `client/src/utils/combatStats.js` dùng chung cho HQ, Campaign và Dungeon: HP, ATK, giáp, wingman, drone, passive phi công, tốc độ bắn, CP hiển thị. Đọc dữ liệu từ catalog và `campaignData`, không lấy từ bên ngoài để cấp tài nguyên.
2. **Sửa tốc độ bắn:** main gun được khai báo tính bằng giây (`0.35`), wingman/drone bằng mili-giây (`900`, `1200`). Mọi scene dùng mili-giây sau chuẩn hóa. Sửa lỗi một số vũ khí phụ bắn quá chậm.
3. **Sửa đạn Dungeon:** 1 va chạm chỉ trừ HP quái một lần, tính sát thương theo đạn thực tế. Boss nhận sát thương từ đạn thật thay vì luôn dùng `stats.atk`.
4. **Chuyển động theo FPS:** bổ sung `frameScale()` và nội suy theo thời gian để giảm sai khác giữa màn hình 30/60/120 FPS; giới hạn bước nhảy khi tab background vừa trở lại. Chưa bảo đảm toàn bộ chuyển động đã hoàn toàn FPS-invariant ở mọi hệ thống.
5. **Lifecycle Babylon:** quản lý/huỷ các timeout gắn với trận trên scene disposal để tránh callback thắng, thua hoặc spawn còn chạy sau unmount.
6. **Rút lui cloud:** người chơi phải nhận xác nhận `battle.abandon` từ Game API trước khi rời trận. Lỗi mạng sẽ hiện thông báo và giữ nguyên màn hình để thử lại; không giả vờ đóng ticket.
7. **Phần thưởng Dungeon (guest):** thưởng xu theo điểm và hệ số event được tính vào danh sách thưởng chờ xác nhận, không tự cộng vào ví trước khi người chơi ấn **Nhận thưởng**. Tài khoản cloud vẫn nhận thưởng do server quyết định.
8. **Nhiệm vụ chế độ khách:** ghi tiến độ tham gia trận, số kill, boss, xu đã tiêu, gacha. Reset ngày/tuần/tháng có tính ngày theo lịch. Không tạo số liệu nhiệm vụ giả mặc định. Cloud vẫn chỉ sử dụng server mission metrics đã xác minh.
9. **Event:** chỉ tăng kill-rush khi sự kiện đang trong thời gian hiệu lực; sự kiện hết hạn không còn cộng coin multiplier. Những sự kiện cấu hình đến 10/2026 đã hết hạn nên sẽ không có active event tự động nếu chưa cập nhật lịch.
10. **Dungeon schedule:** sử dụng UTC trong giao diện chọn phó bản, khớp lịch mà backend Phase 1 đang kiểm tra.
11. **Tests/CI:** `client/tests/gameplayPhase2.test.mjs`, `client/scripts/check-phase2-gameplay.mjs`, `npm run check:phase2`, CI Phase 2.

## II. Cấu trúc bàn giao

- **PATCH ONLY:** chỉ các file khác biệt so với `Phase1 H2 FULL SOURCE` cộng tài liệu, manifest.
- **FULL SOURCE:** source frontend/backend, assets và dự án Android/iOS, không bao gồm `node_modules`, Service Account JSON hoặc `.env`.
- PATCH đặt tại **gốc dự án** có các thư mục `client/` và `server/`; không chỉ chép vào `client/`.
- Mã nguồn và dữ liệu Phase 1 luôn phải được sao lưu trước khi cập nhật.

## III. Hướng dẫn cài trên máy Windows

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\server
npm ci
npm test
npm start
```

Terminal thứ hai:

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\client
npm ci
npm run check:phase2
npm run build
npm run dev
```

Không cần thay đổi Firebase `security/firestore.rules`, không chạy migration Firestore, không tải lại Service Account. **Giữ nguyên** `server/.env` của bạn bên ngoài ZIP, tiếp tục kiểm tra `http://localhost:3000/health` trả `apiReady: true`. Backend API protocol và lệnh giao dịch vẫn là Phase 1; trường `phase: 1` trong health **không phải lỗi**.

## IV. Kiểm tra nghiệm thu

Xem `docs/PHASE2_UAT_VI.md`. Trọng tâm:

- Đăng nhập cloud, xem HQ, trang bị, Campaign/Dungeon và nhận thưởng không mất dữ liệu.
- Thử súng chính, súng phụ, drone; quái bị trừ HP 1 lần/đạn, không bị nhân đôi damage.
- Rút lui khi mạng bình thường và khi tắt Game API; không mất ticket hoặc hiển thị thành công giả.
- Thử 30/60/120 FPS và tab nền, không có boss spawn/callback sau khi rời trận.
- Thử guest missions, gacha và nhận thưởng Dungeon; reload không mất số đã lưu.
- Thử Dungeon sát nửa đêm UTC so với giờ Việt Nam; lịch mở chính xác.

## V. Rollback

1. Dừng Vite và Node server.
2. Khôi phục backup source Phase 1 H2; **không** thay đổi Firestore Rules/dữ liệu từ Phase 2 vì Phase 2 không có migration.
3. Giữ `server/.env` / Service Account dưới quyền riêng tư; chạy lại `npm ci` nếu lockfile thay đổi; `npm test` rồi `npm run dev`.
4. Với hồ sơ đang chơi, sao lưu Firestore trước khi thử nghiệm và sử dụng staging nếu có thể.

## VI. Chưa triển khai / giới hạn

- **Không thể tuyên bố PvE chống hack thương mại:** server Phase 1 vẫn nhận kết quả thắng do client khai báo sau ticket/timing, chưa có server combat simulation/trusted telemetry.
- Thanh toán tiền thật IAP vẫn **tạm khóa**; không phát gem nếu purchase lỗi.
- `d_kill_50` trên tài khoản cloud vẫn không được server tự cộng do thiếu trusted kill telemetry; kiểm thử guest không thay thế yêu cầu xác thực cloud.
- Các tính năng passive đặc biệt như `nova_shield`/`bullet_duplicate` chưa được mô phỏng đầy đủ; chưa coi là hoàn thiện mọi kỹ năng pilot.
- 61 tham chiếu asset tĩnh thiếu, App ID Capacitor/Android không thống nhất và file Firebase native Android không đi kèm source.
- Build Vite, chạy GPU Babylon, Firebase thật, stress test, Android/iOS chưa được thực thi trong môi trường tạo patch; vui lòng nghiệm thu trên máy của bạn.

**Quan trọng:** Phase 2 dùng để tiếp tục phát triển gameplay có kiểm thử hồi quy, **không** là giấy phép phát hành thương mại.
