# Release Gate — Space Fighter Combat Foundation 2.1.5

- [x] Tách constants domain; API `src/constants.js` cũ giữ nguyên.
- [x] ID và DEFAULT_CAMPAIGN_DATA giữ tương thích.
- [x] Cùng game rules/effective stats ở hai scene.
- [x] Fire rate main seconds vs wing/drone milliseconds tường minh.
- [x] Cryo -20% tốc độ, Dungeon không tự debuff người chơi.
- [x] Tốc độ tàu gốc có hiệu lực; X-Wing giữ baseline.
- [x] Buff thời hạn có giới hạn và hoàn nguyên từ baseline.
- [x] Nội tại armor và pilot triển khai lần đầu (phạm vi xem trong tài liệu).
- [x] Preset render và kiểm tra giới hạn model; script đóng gói mobile.
- [ ] WebGL: kiểm tra Campaign/Dungeon desktop + mobile thật.
- [ ] Vite build và Android/iOS build trên máy đủ dependencies.
- [ ] UI khiên, thorns/nova đánh Boss, cân bằng và visual effect hoàn chỉnh.
- [ ] Mức FPS/thermal/memory đo thiết bị thật, asset LOD thay thế 58MB GLB.
- [ ] Backend chiến đấu xác minh kết quả, không chỉ dựa vào battle ticket và kết quả client.
- [ ] Server xác minh StoreKit/Google Play receipt, chống cấp quà trùng IAP.
- [ ] Pháp lý, quyền riêng tư, crash tracking, offline/resume, App Review/Play policy.

Không sử dụng checklist PASS của Node test như chứng nhận game đã đủ điều kiện phân phối thương mại.
