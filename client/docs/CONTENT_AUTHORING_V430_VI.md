# SPACE FIGHTER V4.3.0 — CONTENT AUTHORING FOUNDATION

## 1. Mục tiêu

V4.3 tách **nội dung** khỏi **runtime gameplay** để việc thêm Campaign/Dungeon mới không tiếp tục sửa rải rác trong scene, HUD, QA selector và asset registry.

Nguyên tắc production:

```text
Nội dung dùng mechanic cũ
→ thêm static content pack + asset + localization
→ registry tự project runtime/UI/QA
→ validator và release gate kiểm tra

Mechanic mới thật sự
→ phải thêm runtime + cleanup + HUD + test
```

V4.2.7 được khóa trước khi V4.3 hoạt động. V4.3 không sửa cadence, damage, collision, entry shield, Charger cycle hoặc first-volley guarantee.

## 2. Kiến trúc

```text
CampaignExtensionPacksV430
        │
        └─ CampaignContentRegistryV430
              ├─ PLANET_CONFIG compatibility facade
              ├─ AssetRegistry
              ├─ Guest Battle QA navigation
              └─ Content QA Matrix

DungeonExtensionPacksV430
        │
        └─ DungeonContentRegistryV430
              ├─ DUNGEON_CONFIG compatibility facade
              ├─ Dungeon runtime profile projection
              ├─ HUD / presentation / visual binding
              ├─ AssetRegistry
              ├─ Dungeon QA profiles
              └─ Content QA Matrix
```

Mọi registry được đóng băng sau module load. Không có API đăng ký động trong trận.

## 3. Thêm Campaign mới bằng mechanic có sẵn

1. Tạo file pack riêng trong `src/game/content/packs/`.
2. Pack gồm:
   - `id` duy nhất;
   - `schemaVersion: 1`;
   - `releaseState: 'qa'` khi mới tạo;
   - cấu hình planet;
   - tên đầy đủ VI/EN cho mọi stage;
   - enemy definitions;
   - boss bindings;
   - stage definitions mới nếu cần.
3. Import pack vào `CampaignExtensionPacksV430.js`.
4. Chạy:

```powershell
npm.cmd run check:content-v430
npm.cmd test
npm.cmd run build:mobile
```

Không sửa `CampaignScene.js`, `GuestBattleQaNavigationV26A.js`, `AssetRegistry.js` hoặc màn chọn stage chỉ để thêm planet/stage dùng mechanic cũ.

## 4. Thêm Dungeon mới bằng mechanic có sẵn

Một pack Dungeon phải chứa cùng lúc:

```text
content  = gameplay/runtime definition
listing  = màn chọn Dungeon, lịch mở, reward preview
```

`content` bắt buộc có:

- `id`, `schemaVersion`, `status`, `difficultyRank`;
- `qaReady`, `enabledByDefault`;
- `productionProfile.defaultQaLoadoutPresetId`;
- `runStructure`;
- `visualSet`;
- `enemyStats`;
- `rooms`;
- `presentation` cho pack mở rộng.

`listing` bắt buộc có:

- title/subtitle/desc VI và EN;
- `bgImg`, `themeColor`;
- energy, lịch mở và reward preview.

Registry tự đồng bộ:

- `listing.waves = content.rooms.length`;
- difficulty giữa listing/runtime;
- QA full run;
- QA direct-room cho từng room;
- HUD identity và fallback presentation;
- visual asset registration.

## 5. Room mechanic có sẵn

```text
clear
hazard_clear
destroy_nodes
elite_formation
boss
```

Dungeon mới có thể dùng lại encounter pack/hazard/objective hiện có. Nếu cần mechanic như escort, survival timer, defense node, puzzle hoặc multi-phase map thì phải tạo runtime kind mới cùng cleanup/HUD/test.

## 6. Release state

```text
production = được phép enabledByDefault sau khi đủ evidence
qa         = qaReady=true, enabledByDefault=false
disabled   = không xuất hiện runtime/QA
```

Không được đổi `releaseState` thành production chỉ vì unit test PASS.

Release gate yêu cầu toàn bộ:

```text
catalogValidated
assetsValidated
localizationValidated
webQaPassed
mobileQaPassed
balanceEvidencePassed
regressionPassed
```

## 7. QA tự sinh

V4.3 tạo:

- 1 QA case cho mỗi Campaign planet × stage;
- 1 full-run case cho mỗi Dungeon QA;
- 1 direct-room case cho mỗi room.

Hiện baseline:

```text
Campaign: 3 planet × 10 stage = 30 cases
Dungeon: 3 × (1 full + 5 room) = 18 cases
```

## 8. ID và dữ liệu lưu

ID hiện tại là persistent contract. Không đổi:

- planet ID;
- stage ID;
- dungeon ID;
- room ID;
- enemy/boss/asset ID;
- loadout/reward keys.

Không dùng runtime mutation để đổi catalog theo người chơi.

## 9. Điều kiện thêm nội dung mà không sửa runtime

Được coi là data-only khi toàn bộ đều dùng lại:

- role hiện có;
- projectile/weapon hiện có;
- room kind hiện có;
- hazard/objective profile hiện có;
- boss profile/pattern hiện có;
- damage/reward schema hiện có.

Nếu thiếu một trong các contract trên, phải tạo milestone runtime riêng trước khi pack được phép đăng ký.
