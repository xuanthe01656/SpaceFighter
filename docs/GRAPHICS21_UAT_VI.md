# Checklist UAT Graphics Phase 2.1 — Windows / Android / iOS

**Chuẩn bị:** chạy backend `npm start`, client `npm run dev`; `/health` trả `apiReady: true`; đăng nhập bằng account staging/test. Dùng Phase 2 V1.2.0 + Graphics 2.1, chưa triển khai Rules mới.

## A. HQ / Chọn phi cơ

- [ ] Mở HQ, phi cơ đang trang bị hiển thị ảnh giới thiệu; bên dưới có **HÌNH DẠNG TRONG TRẬN** với ảnh top-down của đúng ID.
- [ ] Chuyển qua X-Wing/Scout/Tank/Phantom/Void/Nebula/Raptor đang sở hữu: sau mỗi lần trang bị, tên, ảnh HQ và preview top đổi theo cùng ID. Không xuất hiện ảnh X-Wing khi đang chọn loại khác.
- [ ] Đối với một trong 9 phi cơ thiếu ảnh: nhìn thấy silhouette có ID/màu riêng, không thấy ảnh vỡ; đây là placeholder, không phải model hoàn chỉnh.
- [ ] Trong Inventory và modal chi tiết phi cơ, icon khớp với ID, không còn fallback sang ảnh `no_image.png` đối với phi cơ.

## B. Campaign / Dungeon

- [ ] Trước trận chọn một phi cơ sở hữu, bắt đầu Campaign: **đúng phi cơ đó** xuất hiện, mũi hướng đầu màn hình (về phía -Z).
- [ ] Kết thúc trận / quay về HQ, vào Dungeon **với cùng phi cơ**: màu sắc, sprite/model và mũi giống Campaign (cho cùng thiết bị/quality).
- [ ] X-Wing ở desktop: hiện top sprite trong khi GLB nạp, chuyển 3D khi hoàn thành. Nếu GLB lỗi phải giữ sprite chính X-Wing và hiển thị cảnh báo `ShipVisualFactory` trong Console.
- [ ] Scout/Raptor (không có GLB): cả hai trận hiển thị ảnh sprite đúng mẫu, không có hình trụ chung.
- [ ] Spectre/Nova (thiếu asset): cả hai trận hiển thị silhouette đúng ID; HQ dùng cùng phom silhouette.
- [ ] Di chuyển, nghiêng máy bay, nhấp nháy sau trúng đạn, thua trận và hiệu ứng động cơ không bị giật/phát sinh model chồng.
- [ ] Va chạm với đạn địch và thân quái hoạt động như Phase 2; không có hiện tượng tàu 3D to hơn dẫn tới hitbox bất thường.
- [ ] Chuyển màn hình nhanh trong khi X-Wing đang nạp: không xuất hiện model ở màn hình mới, không crash, không callback muộn.

## C. Hiệu năng / an toàn

- [ ] Android/iOS/mobile WebView: X-Wing GLB rất nặng không bị tải mặc định; sprite top được sử dụng, gameplay trơn tru.
- [ ] Desktop/Web GPU: kiểm tra FPS và thời gian nạp X-Wing 3D; ghi nhận cấu hình CPU/GPU, RAM và browser nếu có tụt FPS.
- [ ] Đăng xuất/đăng nhập, nhận thưởng sau Campaign/Dungeon và F5 vẫn bảo toàn loadout, coins, energy, progress; không xuất hiện yêu cầu thay schema Firestore.
- [ ] `npm run check:graphics21:full` đạt; `npm run build` biên dịch thành công trên máy của bạn; `npm test` server PASS.

**Báo lỗi:** gửi ảnh HQ trước xuất kích, ảnh trong Campaign/Dungeon, tên phi cơ (aircraftId), thông báo Console (`F12`), hệ điều hành và FPS. Đừng gửi service account JSON hoặc Firebase private key.
