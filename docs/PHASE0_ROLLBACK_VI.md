# ROLLBACK / SAO LƯU PHASE 0

**Trước triển khai:**

1. Sao lưu thư mục project hoàn chỉnh; giữ nguyên `spaceFighter.zip` gốc (SHA-256 nằm trong `README_PHASE0_VI.md`).
2. Trên Firebase staging/production, xác nhận chức năng export/backup dữ liệu phù hợp và sao lưu trước khi chạy client mới. Không áp dụng Firestore rules template/migration chưa kiểm thử.
3. Đảm bảo bạn có quyền truy cập Google Play/App Store, applicationId và cấu hình OAuth trước bất kỳ thay đổi native nào.

**Rollback code:** dừng deployment của Phase 0, quay về source/build trước đó đã kiểm thử và giữ nguyên Firestore. Không tự động xóa `schemaVersion`, `materials`, `eventData`, `dungeonHistory` vừa được thêm. Bản cũ `setDoc` full overwrite có thể xóa các trường mới khi người chơi thực hiện save; do đó rollback cần kế hoạch tương thích hoặc backport serializer, không chỉ đổi build.

**Rollback data:** chỉ khôi phục bằng backup đã kiểm tra nếu xác nhận mất dữ liệu; tránh ghi đè tiến trình mới của người chơi. Vì Phase 0 chưa chuyển DB schema bằng script SQL/migration ngoài luồng đăng nhập, không có lệnh SQL nào cần rollback.

**Về App ID:** Phase 0 không đổi ID Android/iOS. Không tự ý rename package hay thay certificate signing trong bước rollback.
