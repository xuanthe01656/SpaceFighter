SPACE FIGHTER 2.1.8-B2.2 - QA GLB (KHONG PHAI ASSET THUONG MAI)

File: client/public/models/visuals/enemy/p1_small.glb
- Mo hinh 3D cuc nhe (8 tam giac), mui huong -Z, gom 7 clip: spawn, idle,
  move, attack, hit, enrage, death. Chi de xac nhan importer GLB + animation.
- Khong copy GLB thu vao production. Khi khong co GLB, 30 atlas WebP van hoat dong.

CAI DAT THU TREN WINDOWS:
1. Dong game. Giai nen ZIP nay vao C:\Users\TVH01374\Desktop\SpaceFighter\
2. PowerShell:
   cd C:\Users\TVH01374\Desktop\SpaceFighter\client
   npm.cmd run assets:manifest
   npm.cmd run check:enemy-boss-models
   npm.cmd run check:asset-contracts
   npm.cmd test
   npm.cmd run build
   npm.cmd run dev
3. Mo Campaign Alpha tren PC, tim quai p1_small. Model cyan dang mui ten
   se duoc hien thi thay atlas cho rieng ID do. 29 ID khac van la atlas.
4. Quan sat quai bay/ban/trung dan/chet, thoat vao lai, F12 Network .glb = 200.
5. Tren dien thoai, p1_small van phai dung atlas WebP, khong yeu cau GLB.

GO BO GLB QA SAU TEST:
1. Xoa: client/public/models/visuals/enemy/p1_small.glb
2. Chay: npm.cmd run assets:manifest
3. Chay: npm.cmd run check:asset-contracts
4. Khi deploy can npm.cmd run build de cap nhat dist.

Luu y: Chon GLB tren desktop khi file co trong manifest; gioi han 6 model/
scene. Chi co trong B2.2, chua phai release gate hay LOD hoan chinh cua B2.4.
