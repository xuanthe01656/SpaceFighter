# SƠ ĐỒ LUỒNG CODE ĐÃ CHUYỂN ĐỔI Ở PHASE 0

Bản này **không thay đổi kiến trúc gameplay chính**: `main.jsx → App.jsx → Portal/CampaignPortal → GalaxyMap/StageSelect/HQ/CampaignEngine/DungeonEngine`. Xem đầy đủ tại `BASELINE_CODE_FLOW_2026-10-16.md`.

## A. Tạo tài khoản lần đầu

```
Firebase onAuthStateChanged(user)
  → loadUserProfile(user)
  → Firestore getDoc(users/{uid})
  → nếu chưa có hồ sơ:
      createDefaultCampaignData()
      saveUserProfile(null, user)            <-- user tường minh, không bị stale closure
        → createProfileDocument(gsRef, user)
        → serialize snapshot (deep clone)
        → xếp hàng write của tab này
        → setDoc(users/{uid}, snapshot, {mergeFields})
      → ghi sessionId riêng
  → cập nhật UI/định danh
```

## B. Lưu và tải hồ sơ có tính tương thích ngược

```
Component cập nhật gsRef.current.campaignData / coins / diamonds ...
  → saveUserProfile()
      ↳ guest: secureStorage.setItem() với JSON object
      ↳ logged-in: createProfileDocument()
                    ↓
                 queued setDoc({mergeFields:[profile.displayName, ... ,inventory,...]})
                    ↓
                 Firestore users/{uid}

Đăng nhập lại:
  → Firestore getDoc()
  → restoreProfileDocument()
      ↳ ưu tiên schema canonical, fallback campaignData/legacy
      ↳ khôi phục eventData, materials.crates, dungeonHistory
  → cập nhật gsRef
```

`mergeFields` giữ các field khác của document, trong khi `inventory` phải thay thế cả map để việc bán/xóa vật phẩm không bị hồi sinh. Cơ chế này **không giải quyết xung đột đa thiết bị** và **không ngăn gian lận client-side**.

## C. Điểm danh

```
AttendanceModal mở
  → ensureAttendanceWeek(attendance, getRealTime())
  → so sánh weekKey theo Thứ Hai địa phương
  → nếu sang tuần mới: reset claimedDays, weeklyStreak, makeupCount
  → lưu dữ liệu / cập nhật UI
  → handleClaim hoặc handleMakeupClaim
  → saveUserProfile()
```

## D. Xuất kích phó bản

```
HQ.handleLaunch()
  → nếu campaign: vào campaign như cũ
  → nếu dungeon:
      validate cost / energy
      block duplicate click
      cập nhật energy RAM
      await saveUserProfile()
         ↳ false: rollback energy + thông báo lỗi
         ↳ true: pendingEnergyCost=0; setScreen('dungeon')
```

Lưu ý: `setDoc` có thể đợi mạng khôi phục lâu. Chiến lược server reservation/refund sẽ nằm ở Phase 1.

## E. Nạp tiền

```
ShopCampaign.handleTopup()
  → thông báo "Nạp tiền đang tạm khóa"
  → KHÔNG purchasePackage()
  → KHÔNG cộng gems / VIP / first-topup bonus
```

Đây là biện pháp fail-closed. Backend verified IAP và các cập nhật Firestore từ server sẽ triển khai trong Phase 1/3.
