# Space Fighter V4.4.10 - Portal / HQ Visual Polish (WEB PREVIEW ONLY)

## Pham vi va du lieu da doi chieu

Co so: V4.4.9 Portal CSS; V4.4.8 HQ CSS; CampaignPortal/index.jsx V4.4.8 (9 icon); CommandHangarV444.jsx, PilotVisualCatalogV444, ReliableAssetImageV444, CommandHangarAssetPolicyV442 va WebP HUD V3.

### Portal
- Chinh duoc xac nhan tren anh Redmi: anh nen neo button 320x92 co vung noi dung nam lech phai/xuong duoi so voi tam khung anh. Khong dich background hay button nham tranh lech hitbox.
- Phó bản: dich icon va chu ve phai 4..10px va xuong 3..6px; mobile <=380px la 3px / 4px.
- Chiến dịch: dich icon va block title/subtitle ve phai 7..13px va xuong 4..7px; mobile <=380px la 6px / 5px.
- Khong thay doi anh V3 320x92, 9 icon V448, CTA grid, dock 4 muc, safe-area, handler.

### Tong hanh dinh
- Giu nguyen shipSelector (ten, stars, cap, CP, hai mui ten), 6 slot (mainGun, wingman, armor, drone, pilot, skill), shipHero, 3 tabs, pilot card, fleet rail, stats va hai CTA cuoi.
- Dung lai radar WebP va ornament da co: `/assets/ui/spacefighter-hud-v3/scifi/sf_cyan_radar_01.webp`, `/assets/ui/spacefighter-hud-v3/scifi/sf_ornament_01__cyan.webp`.
- Kim loai xanh thep / son ceramic, ve phim xenke, slot mount point, pilot tint theo accent, CP vang am, thay doi tinh te khi focus/hover. Khong dung rank frame de boc trang bi.
- Bao toan `onEquipItem`, `onUnequipItem`, `onSelectAircraft`, `onLaunch`, `onBack`, modal, va logic `manage/prebattle`.
- Anh Pilot tiep tuc qua ReliableAssetImageV444 va fallback local; khong them anh danh nguoi, asset khong du phep, hay GLB.

## Web QA
1. Chay dry-run; apply.
2. `cd client` -> `node.exe --test tests/portalHangarVisualV4410.test.mjs`.
3. `npm.cmd test` -> `npm.cmd run build` (neu script build co san).
4. `npm.cmd run dev -- --host 127.0.0.1 --port 5173` (khong can APK).
5. Mo Edge: `http://127.0.0.1:5173/`; dung DevTools (F12) mobile emulation 393x852 va 430x932. Dang nhap Guest neu can.
6. Kiem tra portal va HQ manage/prebattle, chon slot, pilot/fleet, responsive va network 404 images.
7. Khong `git add`, `git commit` hoac `git push` cho den khi duyet giao dien.

## Pham vi file
- Sua: `client/src/components/CampaignPortal/CampaignPortal.module.css`.
- Sua: `client/src/components/HQ/CommandHangarV444.module.css`.
- Them: `client/tests/portalHangarVisualV4410.test.mjs`.
- Them: `client/docs/PORTAL_HQ_VISUAL_V4410_VI.md`.

Doi voi git branch main, script chi kiem tra hai CSS source tail da biet; no khong ghi vao git index, khong commit/push, khong thay doi gameplay, Firebase, Cloud Run, catalogue hay Economy.

## Hieu chinh quang hoc bang DevTools

Bốn CSS token `--sf-dungeon-art-x`, `--sf-dungeon-art-y`, `--sf-campaign-art-x`, `--sf-campaign-art-y` ở đầu Portal authority điều chỉnh riêng icon/text. Khi QA web có thể thay các số này trong DevTools mà không đổi kích thước nút hoặc hitbox.
