# CHẶN PHÁT HÀNH THƯƠNG MẠI — SPACE FIGHTER PHASE 0

Ngày rà soát: 16/10/2026. Đây là backlog có thứ tự ưu tiên, không phải xác nhận tất cả lỗi đã sửa.

| Ưu tiên | Trạng thái sau Phase 0 | Vấn đề / điều kiện giải quyết |
|---|---|---|
| P0 | CHƯA ĐẠT — cố ý khóa | IAP chưa có API xác thực biên lai/webhook, chống phát thưởng lặp, hoàn tiền. Phase 0 **khóa hoàn toàn** thao tác mua và cấp gem từ client. |
| P0 | CHƯA ĐẠT | Client vẫn có thể tính/cấp thưởng PvE, gacha, nhiệm vụ, sửa `gsRef` và ghi wallet lên Firestore. Không được tuyên bố chống hack/production cho đến khi backend quyết định giao dịch và Rules giới hạn dữ liệu. |
| P0 | CHƯA XÁC MINH | Không có Firestore Security Rules trong nguồn gửi. Kiểm tra/sao lưu rules đang vận hành và thiết kế rules cho server-authoritative v1. |
| P1 | ĐÃ CẢI THIỆN, CẦN UAT | Profile có schema v2, lưu đủ event/crates/dungeon, hỗ trợ legacy, nhưng chưa có schema version migration server-side; Firestore document giới hạn 1 MiB và các vật phẩm lớn phải tách subcollection trong tương lai. |
| P1 | ĐÃ CẢI THIỆN, CẦN UAT | Lưu một phiên đã được tuần tự; khác thiết bị hoặc offline/online vẫn có thể mất cập nhật. Backend transaction/revision cần ở Phase 1. |
| P1 | ĐÃ CẢI THIỆN, CẦN UAT | Energy được lưu trước khi vào dungeon nhưng chưa có server-issued attempt ID/idempotency, quy định hoàn energy khi crash/defeat. Offline có thể chờ Firestore xác nhận lâu. |
| P1 | ĐÃ CẢI THIỆN, CẦN UAT | Attendance reset tuần theo lịch địa phương; cần giờ server và giao dịch atomic để không lợi dụng đổi giờ/thiết bị. |
| P1 | CHƯA ĐẠT | 61 tham chiếu asset literal trong `client/src` không tìm thấy dưới `client/public`; báo cáo từ `npm run audit:assets`. Một số có fallback; chưa xác minh màn hình thật. |
| P1 | CHƯA ĐẠT | Capacitor appId `com.ban.astrocat` khác Android Gradle `com.theIT.spacefighter4`. Không đổi khi chưa chốt định danh đã đăng ký; file google-services.json cần tự cung cấp. |
| P1 | CHƯA ĐẠT | Nhiệm vụ gameplay (kill/boss/gacha/planet/spend) chưa được gắn đủ các điểm tăng progress; event mẫu đã hết hạn. |
| P1 | CHƯA ĐẠT | Source không chứng minh có backend PvP; server chủ yếu trả web assets. Không quảng cáo PvP multiplayer nếu chưa có tính năng thực. |
| P1 | CHƯA XÁC MINH | `npm ci`, `vite build`, Android signed AAB và iOS IPA chưa chạy được trong môi trường phân tích offline; cần chạy trên máy dev/CI có mạng. |
| P1 | CHƯA XÁC MINH | Audit bản quyền thương mại của ảnh, 3D, nhạc, font, SDK, nhãn hiệu và chính sách lưu/thu thập dữ liệu. |
| P2 | CHƯA ĐẠT | Tối ưu `CampaignScene.js`/`DungeonScene.js` theo deltaTime, kiểm tra disposal Babylon và crash/fps trên Android/iOS. |
| P2 | CHƯA ĐẠT | Telemetry/Crash Reporting, màn hình offline, version gate, rollback và khôi phục dữ liệu cần được xây dựng/kiểm thử thực. |
| P2 | CHƯA ĐẠT | Giá trị Firebase Web hiện có fallback để tương thích. Trước khi thương mại, tách dự án dev/staging/prod và xác minh domain/Auth/keystore. |

## Ngưỡng nghiệm thu

- `cd client && npm run check:phase0` cần PASS để phát triển tiếp. Lệnh này **chỉ cảnh báo**, chưa buộc asset/App ID đúng.
- `cd client && npm run check:release` cần PASS ở bản cuối. Lệnh này **bắt buộc asset và config nghiêm ngặt**, hiện dự kiến FAIL.
- Web release: `npm run build` với dependency phù hợp, kiểm thử end-to-end trên Firebase staging.
- Native release: `npx cap sync`, build signed Android/iOS, UAT thực và dashboard theo dõi crash.

Tham khảo: Firebase Firestore giới hạn tài liệu 1 MiB: https://firebase.google.com/docs/firestore/quotas ; Firestore setDoc có thể chờ vô thời hạn khi offline: https://firebase.google.com/docs/reference/js/firestore .
