# Kiến trúc đồ họa Graphics Phase 2.1

## Trước / sau

**Trước:** HQ đọc `imgHq`; Campaign tự nạp GLB và tự tạo sprite fallback; Dungeon luôn tạo plane; nếu PNG hỏng Dungeon dựng hình trụ đồng màu; hình đang chọn đôi khi không tương ứng danh tính thực.

**Sau:** mọi nơi truyền cùng **`campaignData.loadout.aircraft`**. `resolveShipVisual` kiểm tra catalog và manifest asset; `ShipImage` hiển thị HQ/top preview; `ShipVisualFactory` tạo mô hình cho Campaign và Dungeon. Trả về:

```js
{
  tiltNode,        // xoay nghiêng chỉ tác động đồ họa
  collider,        // hình học va chạm độc lập với visual
  ready,           // Promise kết thúc nạp model, không reject
  setVisibility,   // ẩn/tắt/bật cả 3D/sprite/silhouette
  dispose,         // giải phóng tài nguyên trực quan
  getDebugInfo,    // aircraftId, mode, asset status
}
```

Luồng dựng hình:

```text
campaignData.loadout.aircraft
        |
        v
resolveShipVisual -> asset manifest (tồn tại hay không)
        |                     |
        |                HQ / Inventory / ItemModal -> ShipImage
        v
ShipVisualFactory (Campaign + Dungeon)
        |
        +--> collider 2.4 x 2.4 (không xoay theo tilt)
        |
        +--> silhouette tức thời (ID riêng)
                  |
                  +--> top PNG sau khi load thành công (nếu có)
                  |
                  +--> GLB sau khi import thành công (nếu có + phù hợp quality)
```

## Bảo đảm tính ổn định

- Không cho ảnh GLB quyết định hitbox. Phó bản sử dụng `shipVisual.collider` khi kiểm tra `intersectsMesh()`; sát thương/công thức không thay đổi.
- Model nạp trễ sau khi scene đã hủy không thể tạo lại tàu cũ. GLB lỗi không làm rơi về một ID khác.
- Silhouette hình học và preview SVG dùng chung `shipOutline(id, role)` với mũi hướng -Z.
- Asset manifest chỉ phản ánh file cục bộ. Nếu thêm file phải chạy generator; CI kiểm tra có cập nhật manifest hay không.
- `chooseShipRenderQuality` chỉ chọn ảnh/GLB cho **hiển thị**, không ảnh hưởng combat hoặc phần thưởng. Trên mobile, model có >150.000 tam giác hoặc >8 MiB sẽ ưu tiên sprite nếu chưa có model nhẹ.

## Các giới hạn chưa giải quyết

- Đa số phi cơ chưa có model GLB; 9 phi cơ chưa có ảnh thật. Silhouette hiện tại là hình tạm có nhận diện ID, không phải 3D game asset hoàn chỉnh.
- X-Wing GLB 1,871,386 triangles / 57,759,760 bytes chưa phù hợp mobile; cần mesh decimation, LOD, texture compression ở Graphics 2.2.
- `modelRotation` và `modelScale` lấy từ catalog, chưa hiệu chỉnh trục mũi/góc nhìn của GLB bằng GPU/thiết bị thật.
- Babylon NullEngine kiểm tra vòng đời/hitbox; **không thể thay thế kiểm thử hình ảnh, FPS, VRAM trên thiết bị thật**.
- `check:release` vẫn bị chặn vì các asset/định danh khác còn thiếu. Không bật IAP, không thay bảo mật Firebase.
