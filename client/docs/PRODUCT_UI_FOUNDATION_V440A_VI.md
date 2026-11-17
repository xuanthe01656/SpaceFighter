# SPACE FIGHTER V4.4A — UNIFIED PRODUCT UI FOUNDATION

## Mục tiêu

V4.4A tạo một nền presentation dùng chung cho các màn hình sản phẩm trước khi migrate Portal, Campaign Portal, Galaxy Map, Stage Select, HQ, Inventory và Dungeon Select.

Milestone này **không** sửa gameplay, battle ticket, reward, economy, profile persistence, Firebase, Cloud Run authority, content registry, asset activation hoặc Combat HUD.

## Thành phần mới

- `ProductUiFoundationV440.js`: registry policy hiển thị/scroll cho toàn bộ screen hiện hành.
- `ProductScreenShell`: root viewport, tone và scroll policy dùng chung.
- `ProductStateScreen`: loading/error/offline/disabled/empty/success dùng chung.
- `ProductScreenHeader`: header/back/action dùng cho các screen migrate ở V4.4B.
- `GameIconRegistry`: icon SVG dùng chung, không copy icon giữa screen.
- `StatusBadge`: trạng thái semantic dùng chung.
- `ProductUiFoundationV440.css`: focus, reduced-motion và utility toàn cục.

## Thành phần được nâng cấp tương thích ngược

- `GameUiTokens.css`: thêm spacing, typography, surface, safe-area, z-index và motion token.
- `GameButton`: thêm size, busy, selected, leading/trailing icon; API cũ vẫn giữ.
- `GamePanel`: thêm semantic tone; API cũ vẫn giữ.
- `App.jsx`: thay loading/error/disabled UI inline bằng shared state; root dùng `ProductScreenShell`.

## Quy tắc production

1. UI foundation không được sở hữu business state.
2. Mọi screen mới dùng token và primitive chung.
3. Không thêm remote font hoặc runtime stylesheet URL vào foundation.
4. Battle screen dùng scroll policy `locked`; product screen dùng `auto`.
5. QA screens vẫn fail-closed theo build flag hiện hành.
6. V4.4A không redesign Tactical Combat HUD.

## Bước tiếp theo

V4.4B migrate theo thứ tự:

1. Portal
2. Campaign Portal
3. Galaxy Map
4. Stage Select
5. HQ / Inventory / Item Modal
6. Battle Result
7. Dungeon Select

Sau đó V4.4C tích hợp trạng thái offline/CDN vào chính shell này.
