# Graphics 2.1.8-B2.2 - Enemy/Boss GLB Visual Adapter (QA candidate)

## Muc tieu
Cac gameplay root cua Campaign va Dungeon van dieu khien AI, HP, sat thuong,
va cham, movement, reward va Firebase. B2.2 bo sung GLB 3D duoi dang visual
child, khong can sua tung scene khi thay model hop le theo canonical path.

Baseline: Graphics 2.1.8-B2.1 Death Lifecycle, gom Audit Fix B1 va 30 atlas.

## Duong dan art chuan
- `client/public/models/visuals/enemy/<id>.glb`
- `client/public/models/visuals/boss/<id>.glb`
- `client/public/models/visuals/dungeon_enemy/<id>.glb`
- `client/public/models/visuals/dungeon_boss/<id>.glb`

Asset ID, canonical names va gameplay ID khong thay doi.

## Khi khong co GLB
- Khong request GLB URL 404; van dung 30 WebP atlas.
- Neu atlas hong: sprite tinh, sau cung procedural fallback.
- Mobile luon dung atlas trong phase nay.

## Khi GLB da duoc cai va cap nhat manifest
- Desktop thu dung model GLB, toi da 6 model dang active trong scene.
- Khi vuot gioi han, cac quai con lai van dung atlas (khong bi mat hinh).
- Import timeout sau 8 giay; import that bai hoac import tra ve sau khi quai/scene
  da chet thi model duoc huy, khong tao visual moi.
- Animation clip ten `spawn`, `idle`, `move`, `attack`, `hit`, `enrage`, `death`
  duoc map boi `EnemyBossModelCatalog.js`. Khong co clip nao thi model hien
  o the tinh, gameplay khong bi anh huong.
- Death GLB tiep tuc qua `BattleDeathVisualQueue` (thoi gian 250 ms),
  hitbox/gameplay collider duoc huy ngay, khong doi reward.
- Khi can hieu chinh model that, chinh `MODEL_VISUAL_OVERRIDES`
  (chi la visual profile, khong sua Campaign/Dungeon).

## Quy chuan nhap GLB
- GLB glTF 2.0 tu chua geometry/textures, khong link file ngoai.
- Mui model huong truc -Z, X ngang canh, Y la chieu cao.
- Model duoc tu tinh scale theo kich thuoc profile, neu can override.
- Toi da 4 MiB va 25k tam giac cho quai, 8 MiB/60k tam giac cho Boss.
- Dung skin/skeleton/animation glTF chuan, clip co ten phu hop.
- Model phai duoc duyet phap ly va my thuat truoc khi cho vao release.

## Kiem thu Windows PowerShell
Mo PowerShell, luon dung `npm.cmd` de tranh execution policy `npm.ps1`.

```powershell
$root = 'C:\Users\TVH01374\Desktop\SpaceFighter'
Set-Location "$root\client"
npm.cmd pkg get version
npm.cmd run assets:manifest
npm.cmd run check:enemy-boss-art
npm.cmd run check:enemy-boss-models
npm.cmd run check:asset-contracts
npm.cmd run check:gameplay
npm.cmd run check:graphics21
npm.cmd run check:safety
npm.cmd run check:imports
npm.cmd test
npm.cmd run build
npm.cmd run check:bundle
```

Mong doi: version assetsB2.2.0, 30 atlas, 30 model profiles / 0 GLB (khi chua
cai test GLB), 101 visual ID, 156/156 tests neu day du Babylon dependencies,
Vite build PASS. Khong chay Audit script B1 vi hash/version khac nhau.

## Test 3D thuc te
Cai ZIP GLB QA rieng cho enemy `p1_small` vao thu muc goc SpaceFighter.
`npm.cmd run assets:manifest` -> 182 available paths, validator -> 1 delivered
GLB, `npm.cmd run build` -> Vite. Desktop vao Campaign Alpha kiem tra
GLB 3D mau cyan cua `p1_small` thay atlas, animation 7 clip va death lifecycle.
Tren mobile van la atlas. 29 ID khac van la atlas.

GLB QA khong duoc phe duyet phat hanh. Sau test xoa file GLB va tao lai manifest.

## Gioi han B2.2
- Chua toi uu LOD theo khoang cach / phan loai Boss (B2.4).
- Chua gan bullet spawn vao model sockets (B2.3).
- Chua co GLB artwork chinh thuc; su dung 30 atlas cho toan bo qua trinh.
- Build/Vite va GPU/WebGL runtime can nghiem thu tren Windows va dien thoai.
