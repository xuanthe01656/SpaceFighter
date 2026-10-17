# PHASE 1 — BLOCKERS VÀ GIỚI HẠN ĐÃ BIẾT

| ID | Mức | Vấn đề | Hành động trước commercial release |
|---|---|---|---|
| SEC-01 | P0 | Client tự tuyên bố thắng trận PvE; ticket/cooldown/cap không chứng minh đã thắng | Xác minh trận bởi backend hoặc replay/telemetry tin cậy, phát hành thưởng có đánh giá rủi ro |
| SEC-02 | P0 | IAP chưa có verify hóa đơn/webhook/hoàn tiền, đã chủ động khóa | RevenueCat webhook signed + ledger idempotency + đối soát |
| SEC-03 | P0 | Firestore Rules chưa được kiểm thử Emulator/production | Rules integration tests + staging UAT + review shared Firebase collections |
| SEC-04 | P1 | Chưa build Vite/native + test Express thực + Firebase thực tại môi trường phân tích | `npm ci`, build/test trên Windows và thiết bị, staging |
| SEC-05 | P1 | 61 asset literal bị thiếu | Bổ sung model/ảnh hoặc thay fallback cho đủ catalog |
| SEC-06 | P1 | Android App ID khác Capacitor; thiếu google-services.json | Chốt định danh chính thức và config Firebase, không đổi khi app đã phát hành tùy tiện |
| SEC-07 | P1 | Nhiệm vụ kill theo dữ liệu client bị chặn tăng | Thiết kế verified kill telemetry hoặc thay nhiệm vụ có thể xác thực |
| SEC-08 | P1 | Timezone: server dùng UTC, client guest dùng giờ local | Thống nhất thời gian server và màn lịch đối với user đăng nhập |
| SEC-09 | P1 | Chiến đấu bỏ dở vẫn trừ energy phó bản, chưa có refund policy tự động | Xác định công bằng, chính sách mất mạng/crash/refund |
| SEC-10 | P1 | Session login mới đá login cũ; xử lý xóa account Auth/Firestore không giao dịch nguyên tử | UAT account lifecycle và reconciliation job |
| SEC-11 | P2 | Tên người chơi chưa có cơ chế reservation unique toàn cục | Dựng playerNames registry, migrate tên cũ và xử lý tên trùng |
| SEC-12 | P2 | Operations ledger tăng dài hạn; chưa có TTL/archival policy | Thiết kế thời hạn chống double-spend đủ dài, log retention và chi phí |
| SEC-13 | P2 | Chưa có per-IP global rate limit, Firebase App Check, replay-resistant anti-abuse nâng cao | WAF/Cloud Armor, App Check, request monitoring |
| SEC-14 | P2 | Chưa có PvP real-time server authority | Triển khai riêng sau khi hoàn thiện PvE |
| SEC-15 | P2 | Một số event trong code kết thúc tháng 5-6/2026 | Event scheduling server/config mới |

**Hiện trạng:** Bản Phase 1 đã có nhiều biện pháp bảo vệ giao dịch và giảm gian lận, nhưng các P0 trên vẫn khiến dự án chưa thể gọi là phát hành production thương mại. Đừng nhầm “tests passed” với “staging/prod deployed and validated”.
