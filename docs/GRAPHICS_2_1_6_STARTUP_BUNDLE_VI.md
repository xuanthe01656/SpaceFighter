# Graphics 2.1.6 — Startup Bundle & Portal Asset Hotfix

**Baseline:** Graphics 2.1.5.1 Mobile HUD (không áp trực tiếp lên 2.1.3/2.1.5).

## Mục tiêu

Giữ nguyên HUD mobile đã nghiệm thu, sửa hai đường dẫn ảnh Portal mà Vite 2.1.5.1 cảnh báo không resolve, giảm JavaScript tải ở màn hình đăng nhập bằng lazy loading các màn chơi; không thay đổi Firebase, Cloud missions, gameplay, balance, player data hoặc GLB.

## Đường đi dữ liệu / hiệu năng

- `Portal` được import đồng bộ ở `App.jsx` để login xuất hiện sớm.
- Các màn hình HQ, Inventory, Pilots, Galaxy Map, Campaign, Dungeon, Missions, Shop và màn hình kết quả được import bằng `React.lazy`. Babylon và các scene chỉ cần tải khi điều hướng đến màn tương ứng.
- `Suspense` cung cấp trạng thái đang tải; `ScreenLoadBoundary` hiển thị nút tải lại khi dynamic chunk thất bại; `Toaster` nằm ngoài Suspense.
- `src/game/routing/BattleScreenLoaders.js` là nguồn duy nhất cho hàm tải màn Campaign/Dungeon. `HQ.handleLaunch()` `await preloadBattleScreen(mode)` trước khi gọi Cloud `battle.start` hoặc trừ Guest dungeon energy. Như vậy mạng chậm lúc tải chunk không làm bắt đầu thời gian ticket từ quá sớm. Sau đó `React.lazy` dùng lại module đã tải nhờ ESM cache.
- `Portal/index.jsx` lấy đường dẫn asset từ `import.meta.env.BASE_URL`, áp vào hai CSS custom properties qua `style`; `Portal.module.css` chỉ chọn ảnh theo orientation. Đường dẫn hoạt động khi web deploy ở subpath và trong Capacitor local server, không tham chiếu nhầm `src/components/images`.
- `npm run check:bundle` đọc kết quả `dist` từ lần build Vite thực tế, in số lượng chunk và dung lượng entry/gzip, kiểm tra 2 ảnh Portal có trong dist. Không giả định kích thước JS đã giảm một tỷ lệ nhất định nếu chưa chạy build.

## Ranh giới không đổi

Server, `firebase.js`, rules, `gameApi.js`, `useAuth.jsx`, `CampaignScene.js`, `DungeonScene.js`, `BattleHudLayout.js`, danh mục, nhiệm vụ, profile schema và toàn bộ public assets đều không sửa.

## Điều kiện nghiệm thu

1. `npm ci` (nếu cần), `npm test` (dự kiến 78 bài; phụ thuộc Babylon), `npm run check:catalog`, `npm run check:gameplay`, `npm run check:graphics21`, `npm run check:safety`, `npm run build`, `npm run check:bundle`.
2. Vite không còn cảnh báo `Portal.module.css` với `portal_landscape.png`/`portal_portrait.png`. Mở Portal portrait/landscape kiểm tra background hiển thị đúng.
3. F12 Network > JS trên reload mới: Portal không tải Campaign/Dungeon/Babylon ngay. Ghi lại `Startup JS` do `check:bundle` báo và so sánh với baseline 2.1.5.1 (entry `8,983.87 kB` chưa nén, `2,038.63 kB` gzip theo log người dùng, không phải ngưỡng đảm bảo).
4. Thử Guest và Google Cloud: đi Portal > HQ > Campaign; rút lui; đi HQ > Dungeon; kết thúc, xem Missions, Inventory. Mỗi màn chỉ hiện trạng thái tải trong lần đầu; ảnh/âm thanh/touch/HUD vẫn như 2.1.5.1.
5. Trên mạng chậm, nhấn Xuất kích chỉ mở ticket Cloud khi chunk đã tải. Không được ghi trừ năng lượng Guest nếu import chunk thất bại. Kiểm tra F12 Network thứ tự `.js` chunk tải trước `/api/v1/command` chứa `battle.start`.
6. Build/kiểm thử trên máy thật Android/iOS và WebGL Desktop trước khi đưa lên store.

## Giới hạn thử nghiệm

Trong môi trường đóng gói không có npm packages; npm registry không truy cập được. Đã kiểm tra cú pháp JSX/JS, 74 bài client độc lập (không gồm 4 Babylon NullEngine), kiểm tra import/catalog/gameplay/security/graphics và thử parser của `check:bundle` với dist giả lập. Chưa có build Vite mới, chưa đo waterfall/FPS và chưa nghiệm thu trên máy của người dùng.

## Lệnh kiểm thử Windows

```
cd C:\Users\TVH01374\Desktop\SpaceFighter\client
npm test
npm run check:catalog
npm run check:gameplay
npm run check:graphics21
npm run check:safety
npm run build
npm run check:bundle
npm run dev
```

Chỉ áp patch khi source gốc là Graphics 2.1.5.1; không chạy migration Firestore.
