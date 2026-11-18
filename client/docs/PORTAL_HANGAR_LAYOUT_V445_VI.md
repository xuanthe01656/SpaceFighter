# Space Fighter V4.4.5 — Portal / Hangar Layout Lock

## Mục tiêu

V4.4.5 chỉ sửa bố cục thực tế phát hiện trên APK Unified QA:

- năm tiện ích Portal bị dồn thành một cột bên trái;
- CTA Phó bản/Chiến dịch chồng với dock quản lý;
- bốn nút dock giữ positioning cũ nên nổi tự do, mất label và xuống hàng;
- tiêu đề Tổng hành dinh bị cắt;
- thanh hành động HQ dùng `position: fixed` và che nội dung khi cuộn;
- khu tàu HQ quá cao trên viewport điện thoại.

## Quy tắc bố cục mới

### Portal

- tiện ích được chia thành hai rail hai bên bằng positioning rõ ràng;
- CTA chiến đấu có một hàng riêng;
- dock quản lý có một hàng riêng phía dưới;
- mọi child legacy được reset `position/inset/transform` trước khi áp grid;
- label của dock luôn hiển thị.

### Tổng hành dinh

- thanh hành động nằm trong document flow, không che Pilot/Fleet/Stats;
- tiêu đề được phép xuống dòng thay vì ellipsis;
- khu tàu và sáu slot được thu gọn ở điện thoại;
- tab không sticky để tránh chồng lớp khi cuộn.

## Không thay đổi

- gameplay Campaign/Dungeon;
- profile, reward, economy hoặc server authority;
- ảnh tàu/Pilot và cơ chế fallback V4.4.4;
- GLB/CDN model loader;
- Cloud Run.
