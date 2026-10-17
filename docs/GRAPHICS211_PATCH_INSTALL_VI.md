# Huong dan PATCH ONLY — Windows / Source V1.2.1

- **Dieu kien:** dang su dung source `SpaceFighter_FULL_SOURCE_CLEAN.zip` (Graphics 2.1 V1.2.1); khong apply len ban khac neu khong so hash baseline voi `GRAPHICS211_CHANGE_MANIFEST.json`.
- Sao luu thu muc project va profile Guest/Cloud truoc khi thay the code.
- Giai nen patch tai **thu muc goc project** — noi co `client/`, `server/`, `docs/`, `firebase.json`. Khong giai nen vao `client`.
- Vi du PowerShell (chay trong thu muc goc source da sao luu):

```powershell
Expand-Archive -LiteralPath '.\SpaceFighter_Graphics2.1.1_MissionSync_PATCH_ONLY.zip' -DestinationPath '.' -Force
```

- Kiem thu local khi da co npm dependencies (Node >=20):

```powershell
cd server
npm ci
npm test
cd ..\client
npm ci
npm test
npm run check:graphics21
npm run build
```

- Trong truong hop muon trien khai ngay: cap nhat backend truoc client vi backend xac nhan nhiem vu thang 2, diem danh bu va UTC.
- **Khong** sao chep `.env`, `google-services.json`, thay firebase project ID, chay reset Firestore, hoac xoa save data khi apply patch.
- Ban PATCH ONLY chua dung nhung tep thay doi/moi va tai lieu hotfix; khong co asset model/anh hay file quan ly nguoi dung du thua.
