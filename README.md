# MSI Sales Management — Landing Day 1

Hệ thống quản lý nhân viên bán hàng MSI. Gồm trang chính (chatbot sản phẩm, form liên hệ) và trang quản trị nội bộ.

## Công nghệ

- HTML / CSS / JavaScript thuần — không cần build step
- EmailJS — gửi form liên hệ từ trang chính
- Resend API — gửi email tự động từ admin panel
- Dữ liệu lưu trong `localStorage` trình duyệt

## Cấu trúc

```
/                   ← Trang chính (chatbot, form liên hệ)
/admin/             ← Admin panel (nhân viên, đơn hàng, tồn kho)
/data/              ← Tài liệu nội bộ (không serve ra ngoài)
```

## Deploy lên VPS

### 1. Cài Nginx

```bash
sudo apt update && sudo apt install nginx certbot python3-certbot-nginx
```

### 2. Clone repo

```bash
git clone https://github.com/tuantu192005-lgtm/landing-day-1 /var/www/landing-day-1
sudo chown -R www-data:www-data /var/www/landing-day-1
```

### 3. Upload file config bí mật (không có trong git)

```bash
scp resend_config.txt user@vps:/var/www/landing-day-1/
```

### 4. Cấu hình Nginx

Dùng file `nginx_config.txt` (có sẵn local, không trong repo):

```bash
sudo cp nginx_config.txt /etc/nginx/sites-available/landing-day-1
sudo ln -s /etc/nginx/sites-available/landing-day-1 /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 5. Cài SSL

```bash
sudo certbot --nginx -d south.msivn.io.vn
```

### 6. Kiểm tra sau deploy

- `https://south.msivn.io.vn` — trang chính load được
- `https://south.msivn.io.vn/admin/` — admin panel, đăng nhập được
- `https://south.msivn.io.vn/brain.db` — phải trả về 404
- `https://south.msivn.io.vn/resend_config.txt` — phải trả về 404

## Biến cấu hình cần thiết

| File | Nội dung | Lấy từ đâu |
|---|---|---|
| `resend_config.txt` | Resend API Key | [resend.com/api-keys](https://resend.com/api-keys) |

## Lưu ý bảo mật

- `resend_config.txt` bị gitignore — **phải upload thủ công lên server**
- EmailJS credentials trong `index.html` là client-side by design; nên thêm **domain restriction** tại [EmailJS Dashboard](https://dashboard.emailjs.com) → Account → API Keys → Allowed Origins
- `brain.db` và `data/` phải bị chặn bởi Nginx (đã có trong nginx_config.txt)
.
