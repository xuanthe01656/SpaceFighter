# SPACE FIGHTER V4.4B — PRODUCT PORTAL MIGRATION

## Mục tiêu

Đưa hai màn hình đầu tiên của luồng sản phẩm vào Product UI Foundation V4.4A:

- `Portal` — đăng nhập, Guest offline, đặt tên và vào game;
- `CampaignPortal` — hồ sơ, currency, attendance, event, mission, resource, inventory, pilot, shop, Campaign và Dungeon.

## Quy tắc kiến trúc

V4.4B chỉ thay presentation:

- dùng token Product UI và font local/system;
- loại bỏ Google Fonts runtime khỏi hai CSS Module;
- không còn `:root` trong CSS Module màn hình;
- dùng `GameButton`, `GamePanel`, `GameIconRegistry` và `StatusBadge`;
- giữ nguyên toàn bộ handler auth, guest save, account deletion, attendance, missions, navigation và currency;
- không sửa gameplay, reward, economy, Firebase, battle ticket, Cloud Run hoặc Resource Delivery.

## Contract phiên bản

```text
product-portal-migration-v4.4b
```

Hai root screen xuất marker:

```text
data-sf-product-ui="product-portal-migration-v4.4b"
```

## Phạm vi

Đúng 9 file. Xem `FILE_SCOPE_V441.txt` ở gói bàn giao.

## Gate

```powershell
npm.cmd run check:ui-v441
npm.cmd test
npm.cmd run build:mobile
```

## APK QA

Build GitHub Actions bằng `unified_campaign_dungeon_qa=true`, các input khác `false`.

Kiểm tra:

- Portal online/Guest/đặt tên/ready;
- Campaign Portal profile, currency, attendance, missions, events, resources;
- Campaign/Dungeon launch;
- notch, portrait, landscape, tablet;
- mất mạng tại Portal và Campaign Portal không làm font/layout thay đổi;
- background/resume không nhân modal hoặc event;
- account login/logout/delete handlers vẫn gọi đúng luồng cũ.
