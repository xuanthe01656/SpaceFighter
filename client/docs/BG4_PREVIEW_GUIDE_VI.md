# Space Fighter Graphics 2.1.7-BG.4 — Candidate art preview

## Baseline, pham vi

- Baseline duy nhat: Graphics 2.1.7-BG.3 FULL SOURCE (BackgroundCatalog 1.2.0).
- Ban moi: BackgroundCatalog 1.3.0; hai `candidate` moi va bo test.
- **Khong doi** Firebase Auth/Firestore, server, profile nguoi choi, nhiem vu, diem danh, combat, HUD, VFX, map cua 2 demo cu.
- Background Alpha/Nereus dang chay **van la `alpha_coast_demo` va `nereus_ocean_demo`**. Khong co auto-promotion.

## Lua chon background, dung chung mot build

| URL | Alpha va Nereus |
|---|---|
| `http://localhost:3000/` | Hai demo BG.3 cu (mac dinh) |
| `http://localhost:3000/?bg=bg4` | Hai candidate Meshy da sua seam |
| `http://localhost:3000/?bg=legacy` | Starfield cu |
| `http://localhost:3000/?bg=bg4&bgPerf=1` | Candidate + profiler BG.2 |

Neu xem tai cong 5173, thay `localhost:3000` thanh `localhost:5173`.
Them tham so tren URL truoc khi vao Campaign Alpha / Dungeon Nereus, de scene lay gia tri luc khoi tao. Cac world khac luon dung fallback/default.

## Cai PATCH tai Windows

1. **Dung client**, giai nen PATCH tai thu muc goc `C:\Users\TVH01374\Desktop\SpaceFighter`. Ban nay chi dung tren BG.3, khong dung cho BG.2/BG.1.
2. Tiep tuc trong `client`:

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\client
npm ci
npm test
npm run check:backgrounds
npm run check:catalog
npm run check:gameplay
npm run check:graphics21
npm run build
```

3. Neu server cung cap `dist` qua cong 3000, tai lai trang bang `Ctrl + F5`. Neu dung Vite dev:

```bat
npm run dev
```

Server code khong doi, khong can migration Firebase.

## Asset va thong so

| ID thu nghiem | Anh chinh | Anh mobileLow | Scroll |
|---|---|---|---|
| `alpha_coast_v1_candidate` | `candidates/alpha_coast_v1_candidate.webp` | `..._low.webp` | 12 CSS px/s |
| `nereus_ocean_v1_candidate` | `candidates/nereus_ocean_v1_candidate.webp` | `..._low.webp` | 14 CSS px/s |

Ca hai anh duoc **crop giua tu 640x1147 -> 573x1146** (loai 33 px le moi ben, 1 dong cuoi), phuc hoi seam theo phuong phap multi-band symmetric edge blend, sau do **noi suy** len 1024x2048. Anh `_low` la 512x1024. Noi suy khong tao chi tiet do hoa moi.

Quy trinh sua thu nghiem co the tai lap bang `scripts/repair-bg4-seam.py`; khong ghi de anh goc, va **khong thay the viec hoa si retouch/inpaint cau truc o mep**.

### Phat hanh

- `status: candidate`, `artPipelineStatus: review`, `licenseStatus: prototype_only`.
- Manifest deterministic voi SHA-256, khong duoc doi `production` tu dong.
- QA ky thuat cat canh, kich thuoc, alpha, seam cua 8 WebP (4 demo + 4 candidate) co the PASS nhung **ban quyen va tinh lien tuc hinh hoc** phai duoc duyet thu cong.
- Neu thay cong trinh / dao di chuyen "bien hinh" khi chay qua diem noi, can artist fix. Chinh sua tiep ban goc do phan giai cao; khong nen phat hanh ban 640 px noi suy.

## Nghiệm thu thu cong

- Mo Alpha/Nereus moi map >=100 s hoac toi thieu mot chu ky cuon, quan sat diem Y-wrap. Chu y hai ria le do nhieu cong trinh co the mo chong.
- Desktop Chrome va Mobile Responsive: HUD/dan/enemies/ship co binh thuong khong, mau laser co noi bat tren mat nuoc khong.
- A/B tren cung PC bang `?bg=bg4&bgPerf=1` va `?bg=legacy&bgPerf=1`. Chi doi mot yeu to la background.
- Tu dong quay lai demo bang cach bo tham so `?bg=bg4`; khong can rollback Firestore.

## Cac file su dung trong game

```
client/src/game/catalog/BackgroundCatalog.js
client/src/components/Campaign/CampaignScene.js
client/src/components/Dungeon/DungeonScene.js
client/public/images/backgrounds/candidates/*.webp
client/docs/BG3_BACKGROUND_ASSET_MANIFEST.json
client/docs/BG4_ART_PROVENANCE.json
client/tests/battleBackgroundBG4.test.mjs
client/scripts/repair-bg4-seam.py
```
