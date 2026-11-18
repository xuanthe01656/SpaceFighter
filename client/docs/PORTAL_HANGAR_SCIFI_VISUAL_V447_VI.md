# Space Fighter — V4.4.7 Sci-Fi Visual Production

**Mục đích:** đồng bộ chất liệu, viền, màu, typography và các asset HUD V3 cho **Portal** và **Tổng hành dinh**, trên bố cục V4.4.6 đã thống nhất. Không thay điều hướng/gameplay.

## Design direction

- **Portal: Aurora Tactical** — vẫn dùng nền cổng không gian `/images/potal_bg169.png`; 4–5 nút tiện ích thực tế chia hai bên; một CTA cyan cho Chiến dịch, một CTA lime cho Phó bản; management dock đúng bốn đích: Tổng hành dinh/Kho/Phi công/Cửa hàng. **Không có khung Cầu chỉ huy**.
- **HQ: Fleet Industrial** — khoang hangar thép tối, radar cyan độ mờ thấp sau phi cơ, 6 ô trang bị trung tính, 3 tab, Pilot card, Fleet, Stats; hai nút hành động ở cuối luồng cuộn, **không fixed**.
- Khu Pilot không dùng rank/user frame cho súng/giáp. Không hiện chữ tên trang bị quanh phi cơ. Giữ fallback ảnh hiện có.
- Sử dụng font local/system để không cần Google Fonts runtime trong Portal CSS; chữ tiếng Việt không ép uppercase quá mức.

## Nguồn asset

Các file mới lấy nguyên bản từ `SpaceFighter_HUD_AssetPack_V3_FULL_LEGAL_COMPLETE.zip` (WebP 1x), không vẽ lại, đổi tên hoặc dùng asset của game khác:
- `sf_cyan_radar_01.webp`, `sf_ornament_01__cyan.webp` (trang trí HQ nhẹ);
- `sf_neo_button_01__dungeon_normal.webp` (CTA Phó bản);
- `sf_neo_button_01__campaign_normal.webp` và `sf_neo_button_03__campaign_normal.webp` bảo đảm đủ file cho CTA và HQ (các file này có thể đã có từ V4.4.2; nếu giống byte, không sinh Git delta).

Gói HUD V3 có `LEGAL_COMPLETE_20261114.txt` và 8 PDF giấy phép. Chỉ sử dụng dẫn xuất trong dự án Space Fighter theo phạm vi giấy phép tương ứng. Không bổ sung art từ giao diện tham khảo bên ngoài.

## Implementation contract

- `CampaignPortal/index.jsx`: thêm duy nhất `data-sf-visual-v447="aurora-tactical"` vào root V446; không chạm handlers.
- `CommandHangarV444.jsx`: thêm duy nhất `data-sf-visual-v447="fleet-industrial"` vào root; không chạm onLaunch, onBack, onEquip, modes hoặc modal.
- Hai CSS module: **thay thế nguyên khối** CSS V446 bắt đầu từ marker đã kiểm tra SHA, không chồng tiếp V447 cuối file. Phần CSS cũ phía trước vẫn được giữ.
- `package.json`: bổ sung prebuild gate `check:ui-v447`.
- Một regression test V447.
- Không sửa Firebase, economy, reward, dungeon/campaign combat, Cloud Run, profileDefaults, `client/vite.config.js`, Dockerfile và `client/client.7z`.

## Gating / QA

1. Dry-run kiểm tra preimage CSS, ảnh V3, cú pháp JSX/CSS và đúng 12 file. Nếu preimage khác, **dừng** — không `--force`.
2. `--full`: backup, apply, focused tests, full `npm test`, `npm run build:mobile`; lỗi thì rollback từng file về byte gốc.
3. Stage/commit đúng **actual Git delta**, không bắt buộc tất cả 12 file phải thay đổi so với `HEAD`.
4. GitHub Actions unified `unified_campaign_dungeon_qa=true` trên `main`; mọi tùy chọn khác false.
5. QA Redmi Turbo 4 Pro: header không đè, 4 dock buttons, hai CTA không che nhau, menu 2 bên, HQ đủ 6 slot, pilot fallback, chọn tàu/slot đúng, HQ Manage không có Xuất kích, Prebattle có Xuất kích đúng, stage return không đen, offline WebP và background/resume.

**Lưu ý:** test/fixture không thay thế được Android visual QA trên thiết bị thật. Không tuyên bố production PASS trước kết quả đó. Trong bản này chưa bật model Meshy GLB/CDN cho combat.
