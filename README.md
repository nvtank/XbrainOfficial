# XBRAIN VIRTUAL OFFICE — Connect • Work • Collaborate

Văn phòng ảo 3D multiplayer trên trình duyệt, mô phỏng văn phòng **XBrain Đà Nẵng**: tạo nhân vật, đi lại tự do, ngồi vào một trong **50 bàn** để bấm giờ làm việc (đồng hồ chạy theo server), chat, nói chuyện bằng micro theo khoảng cách, họp, pha cà phê, ngắm **cầu Thuận Phước** qua vách kính.

| | |
|---|---|
| ![Khu làm việc](docs/screenshots/workspace.jpg) | ![Toàn cảnh](docs/screenshots/overview.jpg) |
| ![Cầu Thuận Phước ban ngày](docs/screenshots/bridge-day.jpg) | ![Cầu Thuận Phước ban đêm](docs/screenshots/bridge-night.jpg) |
| ![Tạo nhân vật](docs/screenshots/avatar-creator.jpg) | ![Mặt tiền & HUD](docs/screenshots/entrance.jpg) |

**Công nghệ:** React 18 · TypeScript · Vite · Three.js · React Three Fiber · Drei · Rapier · Zustand · Tailwind · Framer Motion · Node.js · Colyseus · PostgreSQL + Prisma · Redis (tuỳ chọn) · LiveKit SFU (WebRTC) · Docker.

Tài liệu kỹ thuật: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (kiến trúc, mặt bằng có kích thước, mô hình dữ liệu) · [docs/LOADTEST.md](docs/LOADTEST.md) (kết quả kiểm thử tải 50 client).

---

## Tính năng

**Không gian 3D**
- Hành lang tòa nhà với **logo XBrain 3D** trên mặt tiền (logo thật được vector hoá & đùn khối, giữ nguyên gradient), cửa kính trượt tự động.
- Sảnh lễ tân: bàn lễ tân + 2 ghế, **vách đen logo nổi có LED**, lối trái/lối phải, sofa chờ, màn hình chào live.
- **5 cụm bàn nằm ngang × 10 bàn = 50 chỗ**, mỗi chỗ có ghế, màn hình (sáng khi có người ngồi), bàn phím, chuột.
- Dãy phòng bên trái (từ cửa vào trong): kệ · tủ (tủ đồ mở được) → phòng họp kính (10 ghế, TV trình chiếu, bảng trắng dùng chung) → phòng bếp (tủ lạnh, tủ, máy pha cà phê, bình nước) → phòng giám đốc (rộng nhất, sofa, kệ sách, đèn cây).
- Vách kính phía đông nhìn ra sông Hàn và **cầu Thuận Phước** (tháp cổng, cáp chính, dây treo, xe chạy, LED đổi màu ban đêm), thành phố, bán đảo Sơn Trà. **Ngày / hoàng hôn / đêm** (tự động theo giờ hoặc chọn tay).
- Trần đen lộ kỹ thuật với đèn LED, ống PCCC đỏ, quạt treo tường cam — dựa trên ảnh thật của văn phòng.

**Nhân vật & điều khiển**
- Avatar creator 3 bước: tên → tuỳ chỉnh (dáng người, chiều cao, da, khuôn mặt, kiểu/màu tóc, áo, quần/váy, giày, kính, mũ/tai nghe, râu, thẻ nhân viên XBrain, khuyên tai) → vào văn phòng. 12 preset nam/nữ/trung tính, xem trước 360°, zoom, thử animation. Lưu vào DB.
- Skeleton 17 xương + SkinnedMesh; animation 2 lớp có blending: idle, walk, run, turn, jump, sit, typing, talk, wave, clap, thumbs-up, cheer, think, bow, dance.
- Rapier character controller: không xuyên tường/bàn ghế/người khác (tuỳ chọn), tăng/giảm tốc, nhảy, chạy.
- Camera: **góc nhìn thứ ba (mặc định, tránh xuyên tường)**, thứ nhất (pointer lock), **toàn cảnh** (ẩn trần, xoay/zoom), 8 camera phòng (lễ tân, khu làm việc, phòng họp, bếp, giám đốc, kho, cầu, mặt tiền) với chuyển cảnh mượt.

**Multiplayer (server authoritative)**
- Colyseus, tối đa **50 người / văn phòng**, thông báo khi đầy; snapshot 15 Hz + nội suy phía client; interest management; kiểm tra di chuyển (tốc độ, xuyên tường, vật cản); rate limit & chống flood; reconnect (giữ ghế + timer 45 s, kể cả khi tải lại trang).
- **Ngồi làm việc**: `[E] SIT & START WORKING` → server khoá ghế (không thể trùng), mở work session, timer `HH:MM:SS` trên đầu avatar theo đồng hồ server, lưu DB; `STAND UP` lưu tổng thời gian. Mất kết nối ⇒ timer tạm dừng, không tính thời gian offline.
- **Dashboard**: online x/50, đang làm việc, bàn trống, thời gian làm việc hôm nay/tuần của tôi, danh sách người đang làm việc. Màn hình trạng thái live cũng hiển thị trên tường văn phòng.
- **Chat**: Global, Nearby (≤ 10 m, bong bóng thoại trên đầu), Private, Meeting Room; emoji, timestamp, thông báo, thu gọn, chống spam.
- **Voice theo khoảng cách** (LiveKit SFU): rõ 0–3 m, giảm dần 3–7 m, rất nhỏ 7–12 m, tắt > 12 m (cấu hình được); âm thanh không gian trái/phải (HRTF); phòng kín chặn âm, phòng họp là vùng âm riêng; mic on/off, push-to-talk, test mic, chọn thiết bị, chỉ báo đang nói, chỉnh âm lượng/tắt tiếng từng người. Không ghi âm.
- **Tương tác vật thể** (đồng bộ cho mọi người): cửa phòng, tủ lạnh, tủ bếp, tủ đồ, ngăn tủ hồ sơ, máy cà phê (hơi nước), bình nước, máy in, TV phòng họp (bật/tắt, chuyển slide), bảng trắng (soạn chung, hiển thị trên bảng 3D), đèn cây, máy tính tại bàn (to-do, ghi chú, timer).
- **Mini map + bản đồ lớn (M)**: phòng, bàn (trống/có người), người chơi, hướng nhìn; click phòng → xem bằng camera / chỉ đường (đường kẻ trên sàn) / teleport (nếu admin cho phép); "Find desk" dẫn đến bàn trống gần nhất.
- **Admin** (`/#/admin`, cần `ADMIN_TOKEN`): người online, kick, mute (chat + voice), sức chứa, bật/tắt teleport, CPU/RAM server, lịch sử work session.
- Settings: chất lượng đồ hoạ Low/Medium/High, thời điểm trong ngày, FOV, độ nhạy camera, đảo trục, **đổi phím**, âm lượng, micro, dải voice, avatar. Chế độ ẩn UI (H), toàn màn hình, performance monitor (`).

---

## Chạy nhanh trên máy (không cần Docker)

Yêu cầu: **Node.js ≥ 20**.

```bash
npm install
npm run dev
```

Mở **http://localhost:5173**. Server game chạy ở cổng 2567 (REST được Vite proxy qua `/api`).
Không đặt `DATABASE_URL` ⇒ server tự dùng memory store lưu vào `apps/server/data/dev-db.json`. Voice tắt cho tới khi cấu hình LiveKit.

Thử multiplayer: mở thêm tab ẩn danh hoặc trình duyệt khác (`http://<IP-LAN>:5173` từ máy khác cùng mạng).

## Chạy đầy đủ (PostgreSQL + LiveKit voice + Redis)

```bash
cp .env.example .env              # chỉnh AUTH_SECRET, ADMIN_TOKEN…
docker compose up -d --build      # postgres, redis, livekit, app
```

Mở **http://localhost:2567** (app phục vụ luôn bản build web). Migration Prisma chạy tự động khi container khởi động.

Hoặc chỉ chạy hạ tầng bằng Docker, code chạy dev:

```bash
docker compose up -d postgres livekit
```

Trong `.env`:

```env
DATABASE_URL=postgresql://xbrain:xbrain@localhost:5432/xbrain?schema=public
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret_dev_key_change_me_please_32chars
```

```bash
npm run db:migrate
npm run dev
```

> Voice cần trang được mở qua `localhost` hoặc **HTTPS** (trình duyệt chỉ cho phép micro trong secure context).

## Điều khiển

| Phím | Chức năng | Phím | Chức năng |
|---|---|---|---|
| W A S D / mũi tên | Di chuyển | Shift | Chạy |
| Space | Nhảy | E | Tương tác / ngồi / đứng lên |
| F | Hành động phụ (dùng máy tính, slide tiếp) | C | Đổi góc nhìn / quay về avatar |
| M | Bản đồ | Enter | Chat |
| T | Bật/tắt mic | V (giữ) | Push-to-talk |
| G (+1…7) | Emote | B | Dashboard |
| H | Ẩn UI | ` | Performance monitor |
| Esc | Menu / đóng panel | Chuột kéo / cuộn | Xoay / zoom camera |

Mọi phím có thể đổi trong **Settings → Controls**.

## Cấu hình

Xem đầy đủ trong [.env.example](.env.example). Quan trọng:

| Biến | Ý nghĩa |
|---|---|
| `SERVER_PORT` | Cổng game server (mặc định 2567) |
| `AUTH_SECRET` | Khoá ký token guest — **bắt buộc đổi khi production** |
| `ADMIN_TOKEN` | Bật API & trang admin |
| `DATABASE_URL`, `STRICT_DB` | PostgreSQL; `STRICT_DB=true` để không fallback memory store |
| `REDIS_URL` | Presence/driver Colyseus khi chạy nhiều process |
| `LIVEKIT_URL/API_KEY/API_SECRET/HOST` | Voice SFU |
| `OFFICE_CAPACITY` | Sức chứa (mặc định 50) |
| `WORK_STAND_MODE` | `stop` (đứng lên = kết thúc session) hoặc `pause` (tiếp tục timer trong ngày) |
| `ALLOW_TELEPORT` | Cho phép teleport giữa các phòng |
| `CHAT_PERSIST` | Lưu lịch sử chat vào DB |
| `VITE_LOGO_URL` | Thay logo (PNG/SVG/WebP được vector hoá & đùn 3D; `.glb` dùng trực tiếp) |

## Kiểm thử

```bash
npm run typecheck                 # shared + server + web
npm run build                     # build web (Vite) + server (tsup)
npm run loadtest -- --url http://localhost:2571 --clients 50 --duration 120 --admin <ADMIN_TOKEN>
```

Kết quả kiểm thử tải 50 client thật: [docs/LOADTEST.md](docs/LOADTEST.md).

## Triển khai production (VPS)

1. DNS: `office.example.com`, `voice.example.com`, `turn.example.com` → IP VPS.
2. Sửa domain trong `deploy/Caddyfile`, `deploy/docker-compose.prod.yml`, sinh key LiveKit và điền `deploy/livekit.prod.yaml`.
3. Mở firewall: 80/443 TCP, 7881 TCP, 3478 UDP, 5349 TCP, 50000–60000 UDP.
4. `docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build`

Caddy cấp HTTPS tự động; LiveKit chạy `network_mode: host` để nhận UDP media, TURN nhúng cho người dùng sau NAT/tường lửa.
Mở rộng: chạy nhiều container `app` với `REDIS_URL` + sticky session ở load balancer; mỗi văn phòng vẫn là một room Colyseus.

---

## Trạng thái theo tiêu chí chấp nhận

| # | Tiêu chí | Trạng thái |
|---|---|---|
| 1–4 | Vào game, đủ phòng & bố cục, 50 chỗ, tạo nhân vật | ✅ Đã chạy & kiểm tra trên trình duyệt |
| 5–6 | Nhiều người thấy nhau, tối đa 50 | ✅ Kiểm tra bằng nhiều tab + 50 client WebSocket thật ([LOADTEST](docs/LOADTEST.md)) |
| 7 | WASD, animation, collision | ✅ |
| 8 | Chat giữa client thật | ✅ (đo trong load test: 209 gửi / 6 652 nhận) |
| 9–10 | Voice theo khoảng cách, phân vùng phòng | ⚠️ Đã cài đặt đầy đủ (LiveKit + WebAudio) nhưng **chưa thử end-to-end** vì máy phát triển không có LiveKit/Docker |
| 11–14 | Ngồi bàn, timer server, đứng lên, không trùng ghế | ✅ (load test: 61 lượt ngồi, 27 lần tranh ghế bị từ chối đúng) |
| 15–17 | Camera 1st/3rd/overview, camera phòng, ngắm cầu | ✅ |
| 18 | Không có nút giả | ✅ Các nút đều gọi chức năng thật; voice báo rõ "not configured" khi thiếu server |
| 19 | Reconnect | ✅ Cài đặt (giữ ghế 45 s, khôi phục sau tải lại trang); chưa có test tự động |
| 20 | Hướng dẫn local & production | ✅ |
| 21 | Load test 50 client | ✅ Server/giao thức đã đo; **FPS client với 50 avatar chưa đo** |
| 22 | Kiểm thử riêng voice SFU | ❌ Chưa chạy — có kịch bản `lk load-test` trong [LOADTEST](docs/LOADTEST.md) |

Không tuyên bố 60 FPS: chưa có số đo FPS phía client với 50 avatar.

## Hạn chế & bước tiếp theo

- Avatar là low-poly procedural (không dùng asset bản quyền); có thể thay bằng GLB đã rig giữ nguyên tên xương.
- Docker image và cấu hình production **chưa được build/chạy thử** trên máy phát triển (không có Docker).
- PostgreSQL store đã viết theo Prisma và migration đã sinh, nhưng phiên thử nghiệm này chạy bằng memory store.
- Đề xuất tiếp: đo FPS 50 avatar trên máy văn phòng phổ thông, test voice với LiveKit thật, test reconnect tự động (Playwright), thống kê ngày/tuần/tháng, đăng nhập SSO công ty.
