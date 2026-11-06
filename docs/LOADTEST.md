# Kiểm thử tải — kết quả đo thực tế

## Lần chạy 2026-11-06 · 50 client · 120 giây

**Môi trường:** 1 laptop Windows 11 · Intel Core i7-1185G7 (4 nhân / 8 luồng) · 32 GB RAM · Node.js 26.8.1.
Server là **bản build production** (`apps/server/dist/index.js`, `NODE_ENV=production`, memory store).
50 bot chạy **trên cùng máy** với server, kết nối qua `localhost`.

Mỗi bot là một client WebSocket thật, đi đúng luồng của trình duyệt (`POST /api/auth/guest` → `GET /api/office` → `joinById`), rồi:
đi theo đồ thị điều hướng ở tốc độ đi bộ và gửi transform 15 Hz, ~60 % bot đi đến bàn ngẫu nhiên và ngồi làm việc 15–45 s rồi đứng lên,
chat (nearby/global) mỗi 20–45 s, emote mỗi 25–55 s, ping mỗi 2 s.

| Chỉ số | Kết quả |
|---|---|
| Client vào phòng thành công | **50 / 50**, 0 lỗi, 0 rớt kết nối |
| Thời gian join (p50 / p95) | 12 ms / 23 ms |
| Snapshot nhận / client | 15 / s |
| Băng thông xuống / client | **7,3 KB/s** (≈ 58 kbit/s) |
| Băng thông ra của server (tổng) | 365 KB/s (≈ 2,9 Mbit/s) |
| Số avatar tối đa trong 1 snapshot | 49 |
| RTT ping (p50 / p95 / p99) | 0 / 3 / 5 ms (localhost) |
| Độ trễ snapshot 1 chiều (p50 / p95 / p99) | 2 / 5 / 7 ms (localhost) |
| CPU process server (TB / đỉnh) | **10,5 % / 15,9 %** của 1 nhân |
| RAM server (RSS đỉnh / heap đỉnh) | **111 MB** / 33 MB |
| Lượt ngồi bàn thành công | 61 (đỉnh 17 người làm việc cùng lúc) |
| Yêu cầu ngồi vào ghế **đã có người** bị từ chối | 27 — không có trường hợp 2 người cùng ghế |
| Movement bị server từ chối (`correction`) | 1 / ~90 000 bản cập nhật |
| Chat gửi / nhận | 209 / 6 652 (định tuyến global + nearby) |

File kết quả gốc: [`docs/loadtest/2026-11-06-50-clients.json`](loadtest/2026-11-06-50-clients.json).

### Giới hạn của phép đo (cần biết khi đọc số liệu)

* Bot và server chạy chung máy, qua loopback ⇒ **độ trễ mạng thực tế không được đo**. Trên Internet, độ trễ = RTT mạng + ~120 ms bộ đệm nội suy phía client.
* Đo phía **server và giao thức**. FPS phía trình duyệt với 50 avatar **chưa được đo trong lần này** (trình duyệt dùng để thử bị ẩn nên bị giới hạn khung hình). Cách đo xem bên dưới.
* **Voice SFU chưa được kiểm thử tải** (máy thử không có Docker / LiveKit). Kịch bản đề xuất ở cuối tài liệu.
* Lần chạy đầu tiên cùng ngày bị bộ giới hạn tạo tài khoản guest (15/phút/IP) chặn bot 16–50 — đó là tính năng chống lạm dụng; lần chạy trên dùng `GUEST_RATE_LIMIT=1000`.

## Cách chạy lại

```bash
# 1) Server production (cổng riêng, bật admin để đọc CPU/RAM)
npm run build -w @xbrain/server
SERVER_PORT=2571 NODE_ENV=production ADMIN_TOKEN=lt GUEST_RATE_LIMIT=1000 node apps/server/dist/index.js

# 2) 50 bot trong 120 s
npm run loadtest -- --url http://localhost:2571 --clients 50 --duration 120 --admin lt
```

Tham số: `--clients`, `--duration` (s), `--sit` (tỉ lệ bot đi ngồi bàn, mặc định 0.6), `--ramp` (ms giữa các lần join).
Kết quả lưu ở `loadtest-results/`.

## Đo FPS phía client với 50 avatar thật

1. Chạy `npm run dev`, mở `http://localhost:5173`, vào văn phòng.
2. Ở terminal khác: `npm run loadtest -- --url http://localhost:2567 --clients 49 --duration 300` (đặt `GUEST_RATE_LIMIT=1000` trong `.env` rồi khởi động lại server dev).
3. Trong game bấm <kbd>`</kbd> để bật Performance monitor (FPS, draw call, tam giác, ping, heap). So sánh Low / Medium / High trong Settings.

## Kiểm thử voice SFU (đề xuất)

```bash
docker compose up -d livekit
# CLI chính thức của LiveKit: 50 người nghe, 10 người nói (audio)
lk load-test --url ws://localhost:7880 --api-key devkey --api-secret secret_dev_key_change_me_please_32chars \
  --room office-xbrain-danang --audio-publishers 10 --subscribers 50 --duration 2m
docker stats   # CPU / RAM / mạng của container livekit
```

Ước tính băng thông: Opus ~32 kbit/s mỗi người nói; với subscription có chọn lọc (≤ 12 m) mỗi client thường chỉ nhận vài luồng thay vì 49.
