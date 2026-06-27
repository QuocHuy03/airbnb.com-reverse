# Airbnb VN Scraper

Cào Airbnb (`airbnb.com.vn`) theo **địa điểm / loại thuê / ngày / khoảng giá**, phân trang tự động.
Mỗi phòng = 1 dòng CSV. Dùng `curl_cffi` impersonate Chrome để qua WAF — **không cần key, login, proxy**.

## Cài
```bash
pip install -r requirements.txt
```
Thư viện `pyairbnb` đã vendor sẵn trong folder, không cần cài thêm.

## Dùng
```bash
# Theo đêm + lọc giá + lấy host
python airbnb_cli.py --location "Hội An, Việt Nam" --type nightly ^
  --checkin 2026-07-10 --checkout 2026-07-12 ^
  --price-min 500000 --price-max 2000000 --adults 2 ^
  --with-host --out hoian.csv

# Theo tháng
python airbnb_cli.py --location "Đà Nẵng" --type monthly ^
  --months 1 --month-start 2026-08-01 --out danang_thang.csv
```

## Tham số
| Cờ | Ý nghĩa |
|---|---|
| `--location` | Tên địa điểm (bắt buộc), vd "Hội An, Việt Nam" |
| `--type` | `nightly` (theo đêm) hoặc `monthly` (theo tháng) |
| `--checkin/--checkout` | Ngày (nightly), định dạng YYYY-MM-DD |
| `--months/--month-start` | Số tháng + ngày bắt đầu (monthly) |
| `--price-min/--price-max` | Khoảng giá (theo currency) |
| `--adults/--children` | Số khách |
| `--place-type` | `"Entire home/apt"` hoặc `"Private room"` |
| `--with-host` | Lấy tên/id/ảnh host (chậm, +1 request/phòng) |
| `--max-pages` | Giới hạn số trang (0 = tất cả) |
| `--currency/--lang/--domain/--proxy` | Mặc định VND / vi / www.airbnb.com.vn |
| `--out` | File CSV xuất ra |

## Cột CSV
`room_id, name, price, price_label, rating, review_count, lat, lng, image, all_images, url, host_name, host_id, host_url, host_avatar, host_phone`

## Giới hạn (sự thật)
- **Không có thuê theo giờ** trên Airbnb — chỉ nightly + monthly.
- **`host_phone` luôn trống** — Airbnb giấu số điện thoại, chỉ hiện sau khi đặt. Không scrape được.
- **~280 phòng/lần search** (giới hạn Airbnb). Quét sạch 1 thành phố → chạy nhiều lần theo quận/khoảng giá rồi gộp + dedup theo `room_id`.
- Cào nhiều/nhanh từ 1 IP có thể dính 429/captcha → dùng `--proxy` residential.
- Vi phạm ToS Airbnb — chỉ dùng cho học/nghiên cứu cá nhân.

# airbnb.com-reverse
