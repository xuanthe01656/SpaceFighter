# BÁO CÁO KIỂM THỬ — PHASE 2 V1.2.0

**Nguồn:** Phase 1 H2, sửa trực tiếp trên code gameplay; ngày kiểm thử 16/10/2026.

| Hạng mục | Kết quả | Ghi chú |
|---|---|---|
| Client Node unit tests | **24/24 PASS** | 10 test nền tảng + 14 gameplay Phase 2 |
| Client Phase1 security static | **14/14 PASS** | Cloud economic write chỉ ở server |
| Client Phase2 gameplay static | **14/14 PASS** | FPS, sát thương, schedule, timer, battle ticket, guest rewards |
| Relative import audit | **89 đường dẫn hợp lệ** | 35 JS/JSX source files |
| Cú pháp Babel/Node | **49 files PASS** | src, tests, scripts, server; 0 lỗi |
| Server Node tests | **20 PASS, 0 FAIL, 3 SKIP** | Express integration tests skip vì thiếu dependency trong môi trường này |
| Vite production build | **CHƯA XÁC NHẬN** | `vite: not found` do không có node_modules; không kết luận build tốt/xấu |
| Asset audit | **WARN: 61 missing literal refs** | Chưa xử lý trong Phase2 |
| Android/native config | **WARN: 2** | App IDs khác nhau, thiếu google-services.json |
| Firebase Auth/Firestore thật | **CHƯA THỬ LẠI** | User báo đăng nhập thành công trên Phase1 H2, không suy ra Phase2 đã được UAT |
| GPU/Babylon 30/60/120 FPS | **CHƯA THỬ THỰC TẾ** | Phải UAT trên thiết bị |
| PvE authoritative anti-cheat | **CHƯA ĐẠT** | Chính sách server-reported result vẫn chưa được chứng minh |

Để hoàn tất nghiệm thu trên Windows:

```bat
cd server
npm ci
npm test

cd ..\client
npm ci
npm run check:phase2
npm run build
npm run dev
```

Mong đợi trên Windows cài đủ Express: server **23 PASS, 0 FAIL** và client **24 PASS, 0 FAIL**. Nếu lỗi, gửi log và tên bước để sửa đúng vị trí.

**Không có thay đổi schema/Rules/biên lai thanh toán; không deploy Firestore hoặc Firebase rules bằng gói patch này.**
