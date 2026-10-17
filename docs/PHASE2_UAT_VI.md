# CHECKLIST UAT — SPACE FIGHTER PHASE 2

Mỗi dòng được đánh dấu PASS chỉ khi đã trực tiếp thử với ít nhất một tài khoản cloud trên Firebase staging và một tài khoản guest độc lập.

## A. Hệ thống (blockers)

- [ ] Server `npm test` 23/23 (trên Windows đầy đủ deps), `/health` có `apiReady:true`.
- [ ] Client `npm run check:phase2` đạt, `npm run build` exit code 0.
- [ ] Đăng nhập được và tạo session cloud, thoát/vào lại không mất ví hoặc progress.
- [ ] IAP vẫn disabled; không có đường nào cấp kim cương từ client.

## B. Campaign / HQ

- [ ] Chọn hành tinh/ải đã mở → HQ, chỉ số CP/HP/ATK hiện đúng, không ReferenceError (`acLevel`).
- [ ] Đổi aircraft, main gun, wingman, armor, drone, pilot rồi reload; trang bị còn đúng.
- [ ] Tàu bắn main gun ~350ms mặc định, wingman ~900ms, drone ~1200ms theo catalog khi lắp.
- [ ] Khi bị trúng đạn, armor và passive pilot giảm damage đúng; dodge/regen không gây âm HP.
- [ ] Thắng / thua ải, stars, thưởng và save thành công; không nhận 2 lần.
- [ ] Rút lui trận cloud: gọi battle.abandon thành công rồi mới rời trận.
- [ ] Tắt game server khi battle đang diễn ra: rút lui bị chặn với thông báo, không tự coi thành công; khôi phục server rồi thử lại.

## C. Dungeon

- [ ] Chọn phó bản có `openDays` UTC phù hợp, server chấp nhận ticket khi năng lượng đủ.
- [ ] Quái thường nhận đúng sát thương từ **một** đạn, không trừ HP gấp đôi.
- [ ] Boss nhận đúng sát thương theo vũ khí, kể cả wingman/drone.
- [ ] Khi dungeon thắng (guest), tiền bổ sung và thưởng nằm trong màn nhận thưởng, chỉ cộng vào ví sau Claim.
- [ ] Khi dungeon thắng (cloud), server tạo thưởng và lưu đúng 1 lần.
- [ ] Rút lui Dungeon cloud phải đóng ticket thành công, không tự xóa năng lượng/thưởng.

## D. Missions / Events

- [ ] Guest missions `d_play_3`, `d_kill_50`, `w_boss_3`, `m_clear_planet`, `w_spend_coins`, `m_pull_gacha` tăng đúng theo hành động.
- [ ] Qua thứ Hai/đầu tháng, các bộ đếm guest reset đúng; `claimed` tương ứng không khóa nhiệm vụ mới.
- [ ] Không mặc định có 15 kills hay 2/5 ngày login cho tài khoản mới.
- [ ] Event đã hết hạn không tăng kills, không tăng coins sau ngày kết thúc.
- [ ] Cloud không nhận thưởng dựa trên số kill client tự khai; `d_kill_50` cloud được ghi nhận là **chưa triển khai**.

## E. Hiệu năng & lifecycle

- [ ] FPS 30/60/120: tốc độ di chuyển, đạn, boss, drone nhìn nhất quán ở mức chấp nhận được.
- [ ] Đưa tab vào background rồi quay lại: không có bước nhảy vật lý cực lớn.
- [ ] Rời Scene khi wave/boss đang chờ spawn: không có callback hoặc spawn còn chạy trên scene cũ.
- [ ] Chơi Campaign/Dungeon nhiều lượt liên tiếp: không rò rỉ observer, timer, Babylon scene/engine; FPS và RAM ổn định.

Nếu còn 1 blocker dữ liệu/trả thưởng/gian lận, **không** chuyển sang release; vẫn có thể tiến hành các tính năng Phase tiếp theo trong nhánh staging.
