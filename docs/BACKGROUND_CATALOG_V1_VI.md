# Space Fighter — BackgroundCatalog v1.0.0 (Graphics 2.1.7-BG demo)

## Mục đích

Bản này tách lựa chọn ảnh nền khỏi logic Campaign/Dungeon. `BackgroundCatalog` quản lý **phần hiển thị**, không lưu Firestore, không tham gia phép tính chiến đấu, tỷ lệ rơi vật phẩm hoặc điểm danh/nhiệm vụ.

**Ảnh demo:** xuất phát từ concept mỹ thuật AI tạo riêng cho thử nghiệm và được xử lý thành texture cuộn. Hai ảnh chưa được duyệt sử dụng thương mại. Cần tạo lại artwork hoàn chỉnh (không đối xứng gương, không chứa đối tượng gameplay/đạn, không lộ mối nối) trước khi đưa lên App Store/Google Play.

## Cấu trúc

```text
client/
  public/images/backgrounds/demo/
    alpha_coast.webp           # 1024×2048 — demo thành phố ven biển
    nereus_ocean.webp          # 1024×2048 — demo biển/căn cứ nổi
  src/game/catalog/BackgroundCatalog.js
  src/game/rendering/ScrollingBackgroundRenderer.js
  scripts/check-background-catalog.mjs
  tests/battleBackground217.test.mjs
```

Các file Gameplay/Player HUD không bị thay đổi nội dung. Thay thế khối tạo starfield bằng một lựa chọn renderer ở hai scene, vẫn giữ nguyên hàm tạo starfield cũ dùng khi không có artwork hoặc asset tải lỗi.

## Binding hiện có

| Chế độ | Vị trí | Background | Ghi chú |
|---|---|---|---|
| Campaign | Hành tinh Alpha (`planetId=1`) | `alpha_coast_demo` | Demo cho mọi ải Alpha (có thể ghi đè từng ải) |
| Dungeon | `dung_nereus` | `nereus_ocean_demo` | Demo đại dương/căn cứ nổi |
| Campaign | Cryo, Inferno | Starfield cũ | Chưa được cấp asset |
| Dungeon | Taurus, Abaddon | Starfield cũ | Chưa được cấp asset |

## Quy trình thêm một bản đồ

1. Vẽ một ảnh nền có **góc camera top-down** phù hợp với hướng bay của tàu. Tránh baked-in ship, đạn, mục tiêu hoặc HUD.
2. Cắt/thiết kế **vertical looping** sạch (mép trên và mép dưới nối nhau), kiểm tra seam khi cuộn liên tục.
3. Xuất một ảnh `base.webp` chất lượng vừa đủ; lớp `overlay.webp` chỉ nếu thực sự tăng giá trị (sương mù, mây). Quy định kích thước và bộ nhớ trong config.
4. Bổ sung một record mới trong `BATTLE_BACKGROUND_CATALOG` gồm ID mới, tên Việt/Anh, biome, revision, layerLimit, danh sách layers, `fallbackColor`, `licenseStatus`.
5. Trong `BATTLE_BACKGROUND_BINDINGS`, thêm mapping theo hành tinh (default và có thể ghi đè `stages`) hoặc dungeon ID. KHÔNG sửa trực tiếp `CampaignScene.js` hoặc `DungeonScene.js` để thêm asset.
6. Chạy `npm run check:backgrounds && npm test && npm run build`. Chụp ảnh và đo FPS/active meshes/draw calls trên Android/Desktop trước khi nghiệm thu.

Ví dụ stage-specific binding trong `BackgroundCatalog.js`:

```js
campaign: {
  1: { defaultId: 'alpha_coast_demo', stages: { 3: 'alpha_harbor_night' } },
}
```

`alpha_harbor_night` phải tồn tại trong catalog trước khi sửa binding.

## Giao diện catalog

- `revision` tăng khi thay asset hoặc rule ảnh; không dùng nó làm version dữ liệu người chơi.
- `status`: `demo` hoặc `production`.
- `licenseStatus`: `prototype_only` hoặc `approved` (build validation chặn `production` nếu chưa `approved`). Đây chỉ là **cổng kiểm tra kỹ thuật**, không thay thế hồ sơ bản quyền thực tế.
- `layers`: `role` (`base`, `overlay`, `weather`); `src` trỏ vào `/public`; kích thước khai báo phải khớp header ảnh; `fit='cover'`, `tiling='repeat-y'`; cuộn theo giây và độc lập FPS.
- `layerLimit`: 1 layer mobileLow, tối đa 2 mobile và 3 desktop; cần đo overdraw trước khi nâng limit.
- `resolveBattleBackground`: thuần dữ liệu. Không gọi API, không đụng Firestore, không mutation.

## Chất lượng & memory

| Mục tiêu | Đề xuất |
|---|---|
| Portrait demo | 1024×2048, 8 bit RGB, WebP |
| Dung lượng đĩa | ≤1.5 MB/layer; hai demo hiện nhỏ hơn nhiều |
| GPU memory | 1024×2048 RGBA ≈ 8 MiB sau giải nén, chưa tính mipmaps |
| Mobile Low | 1 lớp |
| Mobile | 1–2 lớp (ưu tiên 1 nếu nền đã giàu chi tiết) |
| Desktop | ≤3 lớp, phải kiểm tra GPU bandwidth |
| Fallback | Dùng starfield cũ nếu file thiếu/không tải được |

Không dùng ảnh 4K cho mọi thiết bị. Bước nâng cấp sau có thể sử dụng `.ktx2`/BasisU có kiểm tra khả năng GPU và fallback WebP, nhưng bản demo chưa triển khai.

## A/B benchmark không sửa source

- Nền mới: `http://localhost:3000/`
- Nền cũ: `http://localhost:3000/?bg=legacy`

Tải lại trang trước mỗi lượt. So sánh cùng tàu/trang bị/mode/wave/quality, ghi FPS trung bình, frame p95, active meshes, draw calls, JS/GPU memory. Đừng suy luận tăng FPS từ việc giảm số mesh nếu GPU vẫn là nút thắt.

## Đưa vào production thương mại

Các demo hiện chưa đủ: cần artwork sạch không đối xứng phản chiếu, nhiều biome và stage variation, kiểm tra seam/độ nét và tương phản projectile, xác minh quyền thương mại và bản ghi nguồn, cache bất biến theo hash hoặc version asset, đo memory/FPS trên Android/iOS thật, kiểm thử lỗi tải ảnh & reconnect. Không dùng chữ `production` trong config trước khi hoàn thành các bước này.

## Hotfix Graphics 2.1.7-BG.1: vat lieu Babylon khong duoc cong mau trang

`ScrollingBackgroundRenderer` su dung `StandardMaterial.emissiveTexture` de ve anh nen doc lap voi den cua scene. Trong Babylon 9, `emissiveColor` duoc cong voi `emissiveTexture`. Neu dat `emissiveColor=(1,1,1)`, background duoc day len mau trang du WebP hop le va tai thanh cong.

Quy tac cho tat ca background material: **`emissiveColor = Color3(0,0,0)` khi dung emissive texture RGB de hien mau anh that**. Test trong `client/tests/battleBackground217.test.mjs` phai kiem tra mau material, khong chi su ton tai duong dan file.

Moi ground background phai an trong khi tai anh, chi bat len khi `Texture.onLoad` thanh cong. Neu `onError`, tat background ground va goi fallback starfield cu. Khi thay asset sau nay, bat buoc kiem tra screenshot WebGL tren Chrome mobile/desktop va `?bg=legacy`.

---

## Graphics 2.1.7-BG.2 — BackgroundCatalog v1.1.0 (2026-10-17)

### 1. Huong cuon va toc do chuan CSS pixel

- `scrollDirection: 'toward-player'`: dia hinh troi **xuong duoi man hinh** khi tau bay len, dung cam giac tien len.
- `'away-from-player'`: huong nguoc lai neu kich ban can. `'static'`: nen dung yen.
- `layers[].scrollCssPixelsPerSecond`: toc do bang px/s theo **CSS canvas**, khong phu thuoc `devicePixelRatio`, framebuffer GPU, 30/60/120 FPS hoac chinh DPR dong.
- BG demo: Alpha 12 CSS px/s, Nereus 14 CSS px/s. Day la tham so minh hoa co the can doi chinh theo cam giac tro choi.
- `scrollCyclesPerSecond` cu van duoc renderer ho tro cho catalog legacy, nhung asset moi nen dung `scrollCssPixelsPerSecond`.

### 2. Cuon lap vo han va kiem tra seam

Babylon `Texture.WRAP_ADDRESSMODE` chi lap lai UV. **Neu anh goc khong liền mep tren/duoi, se van co duong noi.** Artist can dung anh da lam seamless Y, khong the chi bat `repeat-y` la xong.

Hai WebP demo duoc kiem tra pixel (khong thay asset):

| Asset | Kich thuoc | Mean RGB chenhlech dong dau/cuoi | Max kenh |
|---|---|---:|---:|
| alpha_coast.webp | 1024x2048 | 2.28/255 | 13/255 |
| nereus_ocean.webp | 1024x2048 | 1.01/255 | 8/255 |

Lenh tuy chon (yeu cau Python + Pillow) de artist/QA kiem chung pixel:

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\client
python -m pip install pillow
python scripts\check-background-loop-edges.py
```

Day la kiem tra **do khop mau mep**, khong thay the viec xem video mot chu ky cuon de phat hien cau/tram/dao lap lai. Asset demo Alpha van de lo cac cong trinh doi xung: KHONG coi la asset duyet thuong mai.

### 3. Catalog san xuat/noi dung lon

- `BATTLE_BACKGROUND_CATALOG`: metadata artwork ID, version/revision, biome, license, layer, tex dim, chieu/toc do cuon, gioi han load, fallback.
- `BATTLE_BACKGROUND_BINDINGS.campaign[planetId]`: `defaultId`, `stages` (ghi de 1 ai) va `stageRanges` (`{ from,to,id }` cho vung nhieu ai). Priority: `variantId` thu nghiem > `stages` > `stageRanges` > `defaultId`.
- `BATTLE_BACKGROUND_BINDINGS.dungeon[dungeonId]` tro den ID artwork; hoan toan tach khoi logic gameplay/dungeon difficultly.
- Chat luong: `mobileLow` 1, `mobile` <=2, `desktop` <=3 layers. Tat ca layer duoc render tu 1 ground mesh/texture moi layer, khong sinh ra hang tram sao.
- Chu ky cap nhat artwork: giu `id` neu thay file cua cung theme; tang `revision`. Dung ID moi cho theme moi, tranh thay artwork cua ai khac.
- Quy tac `status: 'production'` chi cho phep khi `licenseStatus: 'approved'` va `layers[].artReview: 'approved'`. Bo validate chi chan thieu metadata, khong thay the kiem dinh quyen su dung/tham chieu anh.

Cau hinh tham khao cho mot vung moi (chua duoc su dung trong code):

```js
const desertBase = {
  id: 'inferno_desert_01',
  revision: 1,
  status: 'demo',
  licenseStatus: 'prototype_only',
  biome: 'desert',
  name: { vi: 'Sa mac Inferno', en: 'Inferno Desert' },
  scrollDirection: 'toward-player',
  loadTimeoutMs: 15000,
  fallbackColor: '#151b1f',
  layerLimit: { mobileLow: 1, mobile: 2, desktop: 3 },
  layers: [{
    id: 'base', role: 'base',
    src: '/images/backgrounds/inferno/desert_base.webp',
    imageWidth: 1024, imageHeight: 2048, seamlessY: true,
    scrollCssPixelsPerSecond: 12,
    opacity: 1, tiling: 'repeat-y', fit: 'cover', priority: 0,
  }],
};
// Phai dat file va register entry truoc khi them binding; validator se chan neu khong co file.
```

### 4. Fallback an toan

1. Texture chua load: an mesh, giu clearColor toi de gameplay van nhin duoc.
2. Anh base loi/404 hoac qua timeout: chi goi fallback starfield cu mot lan, khong de mau trang.
3. Overlay tuy chon loi: tat rieng overlay, van giu base dang hoat dong.
4. Roi scene/nhap lai: giai phong ground mesh, material, texture, callbacks va debug profiler, khong tao object le.

### 5. Benchmark A/B 30 giay

Chay client/server ban **production build** (`npm run build`, `http://localhost:3000`) sau khi ap PATCH:

- `http://localhost:3000/?bgPerf=1` — BackgroundCatalog.
- `http://localhost:3000/?bg=legacy&bgPerf=1` — Starfield cu.

Trong Campaign Alpha hoac Dungeon Nereus, choi cung loai tau, vu khi, wave, viewport va thoi gian. Khi dang choi mo DevTools Console (khong can token), chay:

```js
window.__SF_BG_PERF__.snapshot()
window.__SF_BG_PERF__.exportJson()
```

Sau khi roi tran, `.snapshot()` van cho ket qua cua scene vua dong (giu lich su toi da 6 ket qua). So sanh `frameMsP95`, `fpsAverage`, `activeMeshesAverage`, `drawCallsAverage` (neu engine co `_drawCalls.current`), `meshCountLast` va `jsHeapMiBLast` (chi Chrome). Chup them benchmark Browser Performance de kiem chung; GPU memory/time **khong duoc do** boi profiler nhe nay. FPS gan 60 khi bi gioi han VSync khong du chung minh hieu qua, nen p95, draw calls va memory se quan trong hon.

**Khong dung `?bgPerf=1` khi do FPS phat hanh cuoi cung:** instrumentation co mot chut overhead va chi de so sanh noi bo.

### 6. Bat buoc nghiem thu WebGL

- Campaign Alpha: anh cuon xuong duoi, khong nhay/khong duong noi moi (theo doi 100–120 giay de di qua mot chu ky tren mobile), khong sat vao HUD.
- Dungeon Nereus: thu nhu Alpha, dat thu camera o man hinh dung/ngang.
- Kich thuoc thay doi/DPR giam: toc do trong CSS px/s khong bi thay doi.
- Mat mang/WebP fail, vao ra tran nhieu lan: khong man hinh trang, khong particle/texture nhan doi.
- Khong thay attack/HP/armor, fire rate, hitbox, currency, Firebase, Missions.
- Kiem tra tren Android that va iOS that truoc khi goi production-ready.
