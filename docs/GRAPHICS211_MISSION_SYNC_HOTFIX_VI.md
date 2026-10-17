# Space Fighter — Graphics 2.1.1 + Mission Sync Hotfix

Baseline: **Space Fighter Graphics 2.1 V1.2.1**, tu tep `SpaceFighter_FULL_SOURCE_CLEAN.zip` do nguoi dung cung cap.
Phan ban: **Graphics 2.1.1 + Mission Sync Hotfix** (16/10/2026).

## Noi dung sua

1. **X-Wing:** Chinh `modelRotation.y` cua rieng `ship_xwing` tu `+Math.PI/2` sang `-Math.PI/2`. Phan tich mesh GLB cho thay mui -X, duoi +X; dau tau can huong -Z trong chien dau. Khong sua file GLB, hitbox, weapons, aircraft stats, sprite va cac tau khac. Can UAT Babylon/WebGL tren thiet bi de xac nhan truc hinh anh thuc te.
2. **Lich UTC thong nhat:** Guest va Cloud su dung ngay UTC, tuan UTC bat dau Thu Hai, va thoi gian `getRealTime()` trong cac luong Campaign, Dungeon, Gacha va Mission. Moi ngay UTC bat dau luc 07:00 tai Viet Nam (UTC+7).
3. **Nhiem vu thang `m_login_30`:** Muc tieu `min(30, so ngay cua thang UTC)`: thang 2 thuong 28, thang 2 nhuan 29, cac thang con lai 30. Logic UI Guest, UI Cloud va `mission.claim` tren may chu thong nhat. Trong thang 31 ngay, diem danh ngay 31 van nhan thuong diem danh nhung counter thang khong vuot qua 30.
4. **Guest mission:** Ham `ensureGuestMissions` tu dong reset theo khoa ngay/tuan/thang UTC, khi can se di chuyen cac timestamp reset cu dua tren nhan ngay dia phuong; khong xoa counter/claimed dang thuoc ky hien tai. Thao tac diem danh that duoc dem mot lan/ngay; khong tu dong lay chuoi diem danh lich su de tang bo dem thang/tuan. `d_play_3` van la ba tran Campaign; `m_clear_planet` van la 30 lan thang cac man Campaign (bao gom replay chien thang hop le).
5. **Diem danh bu (Ghost):** Toi da 2 lan/tuan, chi bu o ngay da qua va chua diem danh trong tuan. Lan 1 mat 50 kim cuong; lan 2 mat 150. Bu chi danh dau o trong tuan/tang so luot bu, khong tang streak lien tuc that va khong tang `d_login`, `w_login_5`, `m_login_30`. Van giu co che hoan thanh 7/7 o trong tuan de nhan 5 luot gacha tuan; do server quyet dinh voi Cloud.
6. **Cloud mission:** Hien thi ban xem truoc period reset o client ma **khong ghi lai** Firestore. Server giai quyet nhan diem danh, bù, thưởng mission bang giao dich Firestore va ledger/idempotency hien huu.
7. **Du lieu cu:** Neu `lastClaimUTC` chua ton tai, doc `lastDate` dang `Sun Oct 11 2026` bang parser kiem tra lich, khong dung Date.parse phu thuoc timezone. Cac gia tri streak/so du/so huu van giu nguyen, tru truong hop reset dinh ky thuc su. Khong migration SQL/Firestore tu dong.

## Cac tep he thong co y khong thay doi

- `firebase.json`, `client/src/firebase.js`, `security/firestore.rules`
- `client/src/hooks/useAuth.jsx`, `client/src/utils/profileSchema.js`
- `server/lib/gameService.cjs` (Firestore transaction, request ledger, tai khoan va phien)
- Asset GLB/X-Wing va cac asset bin khac; `.env`, package dependencies va Native App IDs.

## Trinh tu cap nhat / rollback

1. **Sao luu** profile/Firestore (Cloud) va Guest save truoc khi phat hanh, de co phuong an rollback. Ban hotfix khong xoa nguoi choi hay ghi de thong tin dang nhap.
2. Neu dang dung **PATCH ONLY**, giai nen tai thu muc goc source V1.2.1, ghi de dung nhung duong dan trong manifest. Khong copy nham vao `client/` hay `server/` thanh thu muc con.
3. Deploy phan server sau khi chay `cd server && npm ci && npm test`, sau do deploy client `cd client && npm ci && npm test && npm run build`. Khong yeu cau thay Firebase project config/rules.
4. Kiem tra UAT truoc khi phat hanh: X-Wing GLB huong mui; sau UTC 00:00 (VN 07:00) ngay moi; diem danh bù Guest/Cloud; den tuan moi/thang moi; month goal; weekly crate; mission Campaign/Dungeon; profile Cloud ton tai va tai nguyen dung.
5. Neu rollback, dua code frontend/server ve ban backup. Khong can SQL migration. **Khong rollback Firestore bang cach xoa tai khoan hay collection**; profile se co them cac truong UTC (`lastClaimUTC`, `weekKey`, period keys) tuong thich schema cu.

## Gioi han da biet / can xac nhan

- Bo thu vien npm cho Vite/Babylon/Express khong co san va khong tai duoc trong moi truong kiem thu nay. Da test Node, parser va static, **chua build Vite / chua nhin WebGL tren trinh duyet / chua ket noi Firebase thuc**.
- Bao cao asset audit cua baseline co **59 duong dan artwork literal bi thieu**, va audit native config co **2 canh bao** (Capacitor/Android app ID khac nhau va thieu `google-services.json`). Hotfix khong tu y thay app ID/asset Firebase. Xem `GRAPHICS211_TEST_REPORT_VI.md`.
- Ve mat bao mat, PvE Cloud trong baseline co phan xac minh chien dau may chu chua phai simulation authoritative; khong thay doi pham vi do trong hotfix nay.
