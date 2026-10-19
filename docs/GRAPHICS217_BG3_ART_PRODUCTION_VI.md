# Space Fighter — Graphics 2.1.7-BG.3
## Production Art Pipeline & BackgroundCatalog v1.2.0

**Baseline:** Graphics 2.1.7-BG.2 đã nghiệm thu cuộn xuống và không lộ đường nối trong các video Alpha/Nereus.

**Ranh giới thay đổi:** chỉ catalog, art direction, 2 biến thể WebP low và công cụ QA. **Không thay** trận, vũ khí, cảnh, Firebase, Guest/Cloud, kinh tế, điểm danh, UV cuộn BG.2, HUD hoặc VFX.

## 1. Hệ thống đang chạy

| Biome | Trạng thái hiện tại | Background | Nguồn quyền sử dụng |
|---|---|---|---|
| Alpha — ven biển | Demo | `alpha_coast_demo` | `prototype_only` |
| Nereus — đại dương | Demo | `nereus_ocean_demo` | `prototype_only` |
| Cryo / Inferno / Taurus / Abaddon | Đang lên kế hoạch | Chưa gán texture | Giữ nền legacy hiện có |

BG.3 **không tuyên bố hai ảnh demo đã được cấp phép thương mại**, và không đưa các biome chưa có ảnh vào runtime.

## 2. Ngôn ngữ thiết kế Space Fighter

- **Phong cách riêng:** quan sát chiến thuật từ trên cao, công trình khoa học viễn tưởng nhất quán, phối cảnh top-down gần trực giao, màu sắc có chiều sâu; không sao chép bố cục/texture của trò chơi tham khảo.
- **Làn chiến đấu:** trung tâm từ 26%–74% chiều ngang, 15%–84% chiều cao; ưu tiên khoảng không tương phản dịu để nhìn rõ tàu/quái/đạn. Đám mây, tháp, đảo lớn nên hướng ra hai rìa.
- **HUD:** giữ 10% trên cùng ít chi tiết tương phản gắt; 20% dưới cùng lưu ý tàu người chơi/đạn nguy hiểm.
- **Hướng:** camera nhìn từ trên xuống; tàu tiến lên phía trên, địa hình cuộn xuống dưới; ảnh phải lặp theo **trục Y**.
- **Artwork không chứa** HUD, chữ, thanh máu, tàu người chơi, địch, đạn, logo, watermark hoặc asset có quyền sử dụng chưa được duyệt.
- **Mỗi ải không nhất thiết có background riêng:** nhóm ải có thể dùng chung biome nhưng thêm bản đồ đường sá, đường bờ và cấu trúc khác nhau khi cần.

Tệp quy chuẩn máy đọc: `client/src/game/catalog/BackgroundArtDirection.js`.

## 3. Thông số giao hàng của họa sĩ

| Thành phần | Đề xuất | Điều kiện |
|---|---|---|
| Tệp master | PNG/PSD/KRA/BLEND, tối thiểu 1024×2048, khuyên 2048×4096 | Giữ bản gốc và quyền nguồn |
| Background base | WebP 1024×2048 | Đục 100%, không alpha trong base |
| Biến thể mobileLow | WebP 512×1024 | Cùng bố cục, không giật thay ảnh |
| Layer overlay | WebP/PNG có alpha nếu cần | Mỗi lớp phải lặp Y, không che toàn bộ làn giao tranh |
| Dung lượng | Tối đa 1.5 MB mỗi texture theo validator hiện tại | Lý tưởng dưới 500 KiB/lớp mobile |
| Số lớp | Desktop tối đa 3, Mobile 2, MobileLow 1 | Không nhân số layer theo số lượng quái |
| Seam Y | Trung bình RGB ≤8, peak ≤25 khi so hàng pixel đầu và cuối | Bắt buộc kiểm tra chuyển động thực tế ít nhất 1 vòng |
| Màu | sRGB; không nướng (bake) VFX/tàu/đạn vào nền | Giảm chi tiết vùng trung tâm |

**Lưu ý kỹ thuật:** file WebP 200 KiB khi tải về vẫn có thể chiếm ~8 MiB VRAM ở 1024×2048 RGBA (chưa tính mipmaps); cần đo trên thiết bị thật. Không thay bằng một ảnh 4K chỉ để 'đẹp hơn' khi chưa đo.

## 4. Quy trình sản xuất: không có đường tắt lên production

1. **Brief:** chọn biome / ải trong `BACKGROUND_ART_ROADMAP`. Tạo artwork gốc, không kèm UI/tàu/đạn.
2. **Art master:** họa sĩ kiểm tra phối cảnh, mật độ vùng giữa, ánh sáng, kết cấu trên/dưới ghép được theo Y, quyền sử dụng.
3. **Staging WebP** (không tự chỉnh catalog):
   ```bat
   cd C:\Users\TVH01374\Desktop\SpaceFighter\client
   python scripts\prepare-background-assets.py --source "C:\ART\alpha_coast_master.png" --id alpha_coast_v1 --out "..\BG3_Staging"
   ```
   Bước này tạo `alpha_coast_v1.webp`, `alpha_coast_v1_low.webp`, `staging.json` tại folder riêng. Script chặn ảnh không đúng tỷ lệ hoặc không liền mạch; không tự vẽ lại/đổi quyền sử dụng.
4. **Review:** mở bản preview có khung vùng an toàn, kiểm tra đạn cyan và đỏ trên hình; chạy ít nhất 1 chu kỳ ở Chrome Responsive và điện thoại thật. Có checklist license/đóng dấu người duyệt độc lập.
5. **Đăng ký source:** chép ảnh đã duyệt vào `client/public/images/backgrounds/<biome>/`. Thêm entry `BATTLE_BACKGROUND_CATALOG` dạng demo trước; gọi đúng `qualityVariants.mobileLow`.
6. **Gắn ải có kiểm soát:** thêm `BATTLE_BACKGROUND_BINDINGS.campaign[planetId].stageRanges` hoặc `.stages`, hoặc `dungeon[dungeonId]` **sau khi asset đã kiểm tra**. Không đăng ký các ID trong art roadmap trực tiếp.
7. **Khóa manifest:** chạy `npm run backgrounds:manifest` sau khi quyết định thay file; xem git diff JSON hash trước khi commit. Build kiểm tra `--check`, sai hash/thiếu ảnh phải FAIL.
8. **Tự động QA:** chạy `npm run check:backgrounds` và `npm run backgrounds:art-qa`; kiểm tra manifest, seam, center/detail QA. QA của tool **không thay thế người duyệt**.
9. **Cấp quyền release:** chỉ khi tài liệu quyền khai thác và review được lưu trữ, chuyển `status:'production'`, `licenseStatus:'approved'`, `artPipelineStatus:'released'`, `releaseEvidenceId:'BGREL-...'`, `artReview:'approved'` trên mỗi layer. Không đánh dấu approved khi chưa có bằng chứng.
10. **Nghiệm thu nền:** build Android/iOS, kiểm FPS/p95, bộ nhớ, 1 vòng cuộn, cảnh chuyển nền, lỗi tải asset, rời/vào trận 5 lần. Chỉ khi đạt mới đưa vào bản thương mại.

## 5. Ví dụ đăng ký một artwork mới (KHÔNG được kích hoạt chưa khi duyệt)

```javascript
alpha_coast_v1: {
  id: 'alpha_coast_v1', revision: 1, status: 'demo',
  biome: 'coastal_megacity', artDirectionId: 'coastal_megacity',
  artPipelineStatus: 'review', licenseStatus: 'prototype_only',
  name: {vi:'Bờ biển Alpha', en:'Alpha Coast'},
  fallbackColor: '#08283a', scrollDirection: 'toward-player',
  layerLimit:{desktop:3,mobile:2,mobileLow:1}, loadTimeoutMs:15000,
  layers:[{
    id:'base', role:'base', priority:0,
    src:'/images/backgrounds/alpha/alpha_coast_v1.webp',
    imageWidth:1024, imageHeight:2048,
    qualityVariants:{ mobileLow:{
      src:'/images/backgrounds/alpha/alpha_coast_v1_low.webp', imageWidth:512, imageHeight:1024,
    }},
    scrollCssPixelsPerSecond:12, opacity:1, tiling:'repeat-y', fit:'cover', seamlessY:true,
  }],
}
```

Đoạn trên là **mẫu cấu hình**, không phải background đã có trong gói BG.3. Không gán `alpha_coast_v1` vào ải nếu bạn chưa đưa file ảnh vào public/ và chưa chạy validator.

## 6. Công cụ phát hành và đo

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\client
npm test
npm run check:backgrounds
python scripts\check-background-loop-edges.py
python scripts\background-art-qa.py --out "..\BG3_Art_QA"
npm run build
```

`BG3_Art_QA/BG3_ART_SAFEZONE_CONTACT.jpg` thể hiện vùng xanh trung tâm nên thoáng, dải đỏ HUD và dải vàng người chơi. `BG3_ART_QA_REPORT.json` báo seam, độ chi tiết vùng giữa so với rìa, dung lượng/khóa SHA-256. *Không có phép đo nào tự động chứng minh bản quyền hoặc chất lượng mỹ thuật thương mại.*

So sánh A/B runtime giữ nguyên: `http://localhost:3000/?bgPerf=1` và `http://localhost:3000/?bg=legacy&bgPerf=1`, vào trận mới để áp lựa chọn. Dữ liệu A/B chỉ để đo performance, không lưu Firebase.

## 7. Lịch trình sản xuất nội dung dự kiến

| Thứ tự | Nhóm ải/bản đồ | Ý tưởng | Trạng thái |
|---|---|---|---|
| 1 | Alpha 1–5 | Vịnh thành phố ven biển | Art brief; chưa release |
| 2 | Nereus 1–7 | Đại dương và căn cứ nổi | Art brief; chưa release |
| 3 | Alpha 6–10 | Cảng đóng tàu công nghiệp | Planned |
| 4 | Alpha 11–15 | Thành trì và kho vũ khí | Planned |
| 5 | Alpha 16–20 | Tầng khí quyển/quỹ đạo | Planned |
| 6 | Cryo / Inferno | Băng nguyên / dung nham | Planned |
| 7 | Taurus / Abaddon | Hẻm núi / không gian | Planned |

Các ý tưởng này **không thêm debuff hoặc buff**. Mọi tác động gameplay phải đi qua hệ thống combat modifiers độc lập.

## 8. Kiểm soát phát hành

- Không chỉnh `CampaignScene.js`, `DungeonScene.js` khi chỉ thêm một background cùng cách render. Nếu bắt buộc chỉnh, cần review kiến trúc lại.
- Không xóa nền demo/legacy cho đến khi artwork đã được duyệt, vì đây là đường rollback đã kiểm thử.
- Cấu hình nền chỉ chứa `src`, ID, scroll speed, opacity, priority, chất lượng; **không chứa dữ liệu tài khoản, token, endpoint Firebase**.
- Khi đổi nội dung ảnh cùng ID, tăng `revision`, tạo lại manifest, bảo đảm tên file/hash mới tránh cache cũ nếu CDN đã triển khai.
- Kiểm soát ngân sách RAM/GPU bằng số pixel decode và số texture, không nhìn riêng kích thước WebP tải về.
