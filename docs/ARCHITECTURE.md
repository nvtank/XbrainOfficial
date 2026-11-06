# XBrain Virtual Office — Kiến trúc kỹ thuật

Tài liệu này trả lời Bước 1–3 của master prompt: kiến trúc cho 50 người đồng thời, sơ đồ mặt bằng có kích thước, cấu trúc thư mục và mô hình dữ liệu.

---

## 1. Kiến trúc tổng thể

```
                 ┌──────────────────────────── Trình duyệt (desktop) ────────────────────────────┐
                 │ React 18 + TypeScript + Vite                                                   │
                 │  ├─ React Three Fiber / Drei / Three.js  ── scene 3D, avatar skinned mesh      │
                 │  ├─ @react-three/rapier                  ── character controller, collider     │
                 │  ├─ Zustand stores                       ── UI state (không re-render 60 Hz)   │
                 │  ├─ colyseus.js  ─────────── WebSocket ─────────┐                              │
                 │  └─ livekit-client ── WebRTC (audio) ───────┐   │                              │
                 └─────────────────────────────────────────────┼───┼──────────────────────────────┘
                                                               │   │  REST /api (fetch)
                 ┌───────── LiveKit SFU (Go) ──────────┐       │   │
                 │ phòng "office-<id>", chỉ audio       │◄──────┘   │
                 │ selective subscription, TURN nhúng   │           ▼
                 └──────────────────────────────────────┘   ┌───── Node.js game server ─────────────┐
                              ▲ RoomService (mute/kick)     │ Express REST API                      │
                              └─────────────────────────────┤ Colyseus OfficeRoom (authoritative)   │
                                                            │  ├─ seats / work timer / chat / objs  │
                                                            │  ├─ movement validation               │
                                                            │  └─ 15 Hz snapshots + interest mgmt   │
                                                            │ Store: Prisma ⇄ PostgreSQL            │
                                                            │        (fallback: JSON memory store)  │
                                                            │ Redis presence/driver (tuỳ chọn)      │
                                                            └───────────────────────────────────────┘
```

### Vì sao chọn như vậy

| Vấn đề | Lựa chọn | Lý do |
|---|---|---|
| Đồng bộ trạng thái | **Colyseus 0.15**, 1 room = 1 văn phòng (tối đa 50) | Room đơn luồng → mọi thao tác ngồi ghế được xử lý tuần tự ⇒ không thể có 2 người cùng một ghế. Delta-encoding schema cho dữ liệu thay đổi chậm. |
| Vị trí/animation | Snapshot tuỳ chỉnh 15 Hz, lượng tử hoá (cm, mrad) | Không đưa transform vào schema để làm **interest management** theo từng client: người ở gần (< 28 m) nhận mỗi tick, người ở xa mỗi 4 tick, keyframe 1 Hz so le. |
| Quyền quyết định | Client-predicted, **server-validated** | Server kiểm tra tốc độ tối đa, vùng đi được, xuyên tường (segment vs AABB) và điểm nằm trong vật cản — dùng **cùng dữ liệu layout** với client. Sai ⇒ gửi `correction`. |
| Thời gian làm việc | Timestamp của server (`workSegmentStart`, `workAccumMs`) | Client chỉ hiển thị; đồng hồ client được hiệu chỉnh NTP-style bằng ping/pong. Mất kết nối ⇒ segment bị **tạm dừng** ⇒ không tính thời gian khi offline. |
| Voice | **LiveKit SFU** | Mesh 50 người = 1 225 kết nối P2P — không khả thi. SFU: mỗi người publish 1 track, subscribe **có chọn lọc** chỉ những người trong bán kính (12 m + 2 m hysteresis). |
| Âm thanh không gian | WebAudio: Gain (dải khoảng cách) → Lowpass (xuyên tường) → HRTF Panner | Dải 0–3 / 3–7 / 7–12 / >12 m cấu hình được; phòng kín chặn âm (×0.06, cửa mở ×0.3), phòng họp là vùng âm riêng. |
| Vật lý | Rapier kinematic character controller | Không xuyên tường/bàn ghế/người khác, autostep, snap-to-ground, nhảy. |
| Đồ hoạ | Batching: gộp hình học tĩnh theo vật liệu | 50 bàn + 89 ghế + 4 phòng ≈ 40 draw call cho toàn bộ nội thất tĩnh; avatar = 1 SkinnedMesh + 1 vật liệu dùng chung. |
| CSDL | PostgreSQL + Prisma; fallback JSON | Chạy được ngay trên máy không có Docker, production dùng Postgres (`STRICT_DB=true`). |
| Mở rộng | Redis presence/driver của Colyseus | Nhiều process game server sau load balancer; mỗi văn phòng vẫn là 1 room. |

### Luồng một lượt "ngồi làm việc"

1. Client đứng gần ghế → `InteractionSystem` hiện **[E] SIT & START WORKING**.
2. `sit {seatId}` → server kiểm tra: ghế tồn tại, chưa có người, người chơi chưa ngồi, khoảng cách ≤ 3 m.
3. Server ghi `seats[seatId] = sessionId`, đặt vị trí = ghế, tạo `WorkSession` (DB) và `workSegmentStart = now`.
4. Mọi client nhận patch → avatar chạy blend **idle → sit → typing**, nameplate hiện `WORKING HH:MM:SS`.
5. `stand` → server đóng session (`activeMs`, `endedAt`, `endReason`), giải phóng ghế, đặt vị trí = điểm đứng an toàn.
6. Rớt mạng: ghế + timer giữ **45 s** (tạm dừng), reconnect ⇒ chạy tiếp; quá hạn ⇒ session đóng tại thời điểm rớt mạng.

---

## 2. Mặt bằng văn phòng (đơn vị: mét)

Hệ toạ độ: nhìn từ cửa chính vào trong; **+X = phải (đông, kính nhìn cầu Thuận Phước)**, **−Z = vào sâu (bắc)**. Trần 3,2 m.

```
 z=-30 ┌──────────────┬──────┬──────────────────────────────────────────┬──────┐  ← kính (bắc)
       │  PHÒNG       │      │                                          │ Góc  │
       │  GIÁM ĐỐC    │  L   │   Cụm 5  ═══════════════════  (z=-25)    │ ngắm │
       │  7 × 11 m    │  Ố   │                                          │ cầu  │
       │  (kính mờ)   │  I   │   Cụm 4  ═══════════════════  (z=-20)    │      │
 z=-19 ├──────[cửa]───┤      │                                          │ quầy │
       │  PHÒNG BẾP   │  T   │   Cụm 3  ═══════════════════  (z=-15)    │ bar  │ ← kính đông
       │  7 × 7 m     │  R   │                                          │  +   │   (cầu Thuận
 z=-12 ├──────[cửa]───┤  Á   │   Cụm 2  ═══════════════════  (z=-10)    │ ghế  │    Phước)
       │  PHÒNG HỌP   │  I   │                                          │ cao  │
       │  7 × 7.5 m   │      │   Cụm 1  ═══════════════════  (z=-5)     │      │
 z=-4.5├──────[cửa]───┤ 2.5m │                                          │      │
       │  KỆ · TỦ     │      │      [màn hình trạng thái live]          │      │
 z=0   └──────────────┴[LỐI]─┴──────[ VÁCH ĐEN · LOGO XBRAIN ]─────[LỐI]─┴──────┘
                      │ TRÁI       x=-4.5 … 4.5          PHẢI │
                      │        [ghế]   [ghế]                  │
                      │      ┌─ BÀN LỄ TÂN 3.6 m ─┐           │  SẢNH LỄ TÂN
                      │  sofa                              │  14 × 7 m
 z=7   ═══════════════╧════[kính]══[CỬA TRƯỢT 3 m]══[kính]═══╧═══════════  MẶT TIỀN + LOGO 3D
                         HÀNH LANG TÒA NHÀ (thang máy, ghế chờ) — điểm spawn
 z=14  ─────────────────────────────────────────────────────────────────────
     x=-16          x=-7                                     x=7             x=16
```

| Khu vực | Toạ độ X | Toạ độ Z | Kích thước | Nội dung |
|---|---|---|---|---|
| Hành lang tòa nhà | −16 … 16 | 7 … 14 | 32 × 7 | Logo 3D trên mặt tiền, cửa kính trượt tự động, 2 thang máy, cây, ghế chờ |
| Sảnh lễ tân | −7 … 7 | 0 … 7 | 14 × 7 | Bàn lễ tân 3,6 m + 2 ghế, vách đen logo XBrain nổi + LED, sofa chờ, màn hình chào |
| Lối trái / phải | −7 … −4.5 / 4.5 … 7 | z = 0 | 2,5 m mỗi lối | Hai lối hai bên vách logo |
| Kệ · tủ | −14 … −7 | −4.5 … 0 | 7 × 4.5 | Kệ hồ sơ, 33 tủ đồ (8 cánh mở được), 2 tủ tài liệu, máy in |
| Phòng họp | −14 … −7 | −12 … −4.5 | 7 × 7.5 | Bàn 1,4 × 4,2 m, **10 ghế**, TV 86", bảng trắng, cửa kính, cây |
| Phòng bếp | −14 … −7 | −19 … −12 | 7 × 7 | Tủ bếp đỏ, bồn rửa, máy cà phê, tủ lạnh, bình nước, kệ cốc, 2 bàn tròn × 4 ghế |
| Phòng giám đốc | −14 … −7 | −30 … −19 | 7 × 11 (**lớn nhất**) | Bàn giám đốc, ghế, 2 ghế khách, sofa 3 chỗ + armchair, bàn trà, kệ sách, tủ, đèn cây, cửa kính lớn |
| Hành lang trái | −7 … −4.5 | −30 … 0 | 2,5 m | Cửa 3 phòng, cột |
| Khu làm việc | −4.5 … 10.2 | −30 … 0 | 14.7 × 30 | **5 cụm ngang**, cụm = 8 × 1,5 m, tâm x = 3,5 |
| Góc ngắm cầu | 10.2 … 12 | −30 … 0 | 1.8 × 30 | 2 quầy bar 8 m, 6 ghế cao, điểm "Enjoy the view" |

### 50 bàn làm việc

* 5 cụm nằm **ngang** (cạnh dài song song trục X), xếp từ lễ tân vào trong ở `z = −5, −10, −15, −20, −25`.
* Mỗi cụm 2 hàng × 5 bàn **đối diện nhau**; bàn 1,6 × 0,75 m, cao 0,74 m.
* Hàng A (phía lễ tân) người ngồi quay mặt về bắc; hàng B quay về nam.
* Khoảng cách: lối đi trước cụm 1 = 3,4 m; giữa hai hàng ghế của hai cụm liền kề = 2,1 m; lối hai đầu cụm ≈ 4 m.
* ID: `D{cụm}-{01..10}`; mỗi bàn có `seatId`, vị trí ngồi, hướng, **điểm đứng an toàn** (lùi 0,72 m), trạng thái trống/đang dùng, tên người ngồi.

Tổng số chỗ ngồi tương tác: **89** (50 bàn + 2 lễ tân + 2 sofa sảnh + 10 họp + 8 bếp + 1 giám đốc + 2 khách + 4 sofa/armchair + 6 ghế cao + 4 ghế chờ).

---

## 3. Cấu trúc thư mục & dữ liệu

```
├── apps/
│   ├── server/src/
│   │   ├── index.ts            # Express + Colyseus bootstrap, Redis (tuỳ chọn)
│   │   ├── config.ts           # biến môi trường
│   │   ├── api/routes.ts       # REST: auth guest, avatar, office, stats, voice token, admin
│   │   ├── rooms/OfficeRoom.ts # logic authoritative
│   │   ├── rooms/schema.ts     # OfficeState / Player (Colyseus schema)
│   │   ├── services/           # store (Prisma | memory), auth HMAC, LiveKit, rate limit, time
│   │   └── scripts/loadtest.ts # 50 client WebSocket thật
│   └── web/src/
│       ├── game/
│       │   ├── environment/    # Building, furniture builders, batching, Logo3D, Outdoor (cầu), Lighting
│       │   ├── avatars/        # avatarFactory (skeleton+skin), animations, animator, LocalPlayer, RemotePlayers
│       │   ├── cameras/        # CameraRig: 3rd/1st/overview/room presets
│       │   ├── interactions/   # InteractionSystem, NavGuide
│       │   ├── controls/       # input manager (phím có thể đổi)
│       │   └── runtime.ts      # trạng thái per-frame + interpolation buffer
│       ├── services/           # api, network (Colyseus), voice (LiveKit + WebAudio), clock, sfx
│       ├── stores/             # Zustand: app, game, world, chat, voice, settings
│       └── ui/                 # LoadingScreen, AvatarCreator, HUD, Settings, Map, Admin…
├── packages/shared/src/
│   ├── layout.ts               # ★ toàn bộ mặt bằng: zone, tường, cửa, bàn, ghế, nội thất, vật cản,
│   │                           #   vật tương tác, camera preset, đồ thị điều hướng
│   ├── validation.ts           # kiểm tra di chuyển (server dùng)
│   ├── avatar.ts               # AvatarConfig, preset, sanitize
│   ├── protocol.ts             # tên & kiểu message
│   ├── nav.ts                  # Dijkstra trên đồ thị waypoint
│   └── constants.ts
├── prisma/schema.prisma (+ migrations)
├── docker-compose.yml · Dockerfile · livekit.yaml · deploy/
└── docs/
```

### Office layout data (tách khỏi component)

```ts
SeatDef      { id, kind: 'desk'|'meeting'|…, label, x, z, rotY, seatHeight, stand:{x,z}, zone, chair, deskId?, hasComputer? }
DeskDef      { id: 'D3-07', cluster: 3, index: 7, row: 'B', x, z, rotY, seatId }
FurnitureDef { id, type, x, y?, z, rotY, w, d, h, zone, collider?, variant? }
WallDef      { id, axis, at, from, to, thickness, y0, height, material, openings[] }
DoorDef      { id, hinge, axis, width, dir, swing, style, zones }
InteractableDef { id, kind: 'seat'|'door'|'toggle'|'timed'|'tv'|'whiteboard'|'view'|'lamp', label, verb, x, y, z, radius }
OBSTACLES    // sinh tự động từ tường + nội thất có collider + ghế → collider Rapier (client) & validation (server)
```

### Avatar

```ts
AvatarConfig { body, height, skin, face, hair, hairColor, top, topColor, bottom, bottomColor,
               shoes, shoesColor, glasses, headwear, headwearColor, beard, badge, earrings }
```
* Skeleton 17 xương (hips, spine, chest, neck, head, 2×3 tay, 2×3 chân); một `SkinnedMesh` với trọng số cứng + vertex color.
* Animation `THREE.AnimationClip` chia **2 lớp** (thân dưới / thân trên) → vừa ngồi vừa vẫy tay, vừa đi vừa nói. Clip: idle, walk, run, turn, jump, sit, typing, talk, wave, clap, thumbs-up, cheer, think, bow, dance. Crossfade 0,2–0,55 s.
* Có thể thay bằng GLB đã rig (Mixamo/RPM) – chỉ cần giữ tên xương.

### Multiplayer state

```ts
OfficeState (Colyseus schema, delta-encoded, patch 10 Hz)
  players: Map<sessionId, Player{ idx, userId, name, avatar(JSON), role, seatId, working,
                                   workSegmentStart, workAccumMs, online, micOn, muted, zone, joinedAt }>
  seats:   Map<seatId, sessionId>
  objects: Map<objectId, number>   // cửa, tủ lạnh, tủ, TV slide, đèn, timestamp máy cà phê…
  boards:  Map<boardId, string>    // bảng trắng dùng chung
  officeId, officeName, capacity, allowTeleport, serverStartedAt

Snapshot (custom message, 15 Hz, theo từng client)
  { t: serverTime, p: [[idx, x*100, y*100, z*100, rotY*1000, animCode], …] }
```

### CSDL (Prisma)

`User`, `AvatarConfig`, `OfficeInstance`, `WorkSession` (cũng là lịch sử sử dụng bàn), `ChatMessage` (chỉ khi `CHAT_PERSIST=true`), `ModerationAction`.
