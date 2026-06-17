# /data — Kho dữ liệu hệ thống MSI Sales Management

Thư mục này chứa toàn bộ dữ liệu tham chiếu cho hệ thống quản lý bán hàng MSI Việt Nam.

## Cấu trúc

| Thư mục | Nội dung | Cập nhật |
|---|---|---|
| `/products/` | Thông tin chi tiết từng dòng sản phẩm MSI | Theo chu kỳ ra hàng |
| `/policies/` | Chính sách bán hàng theo mã hàng | **Hàng tháng** |
| `/faq/` | Câu hỏi thường gặp của nhân viên | Khi có vấn đề mới |
| `/npps/` | Thông tin 6 NPP: DGW, SPC, KTC, NWH, MH, AD | Khi có thay đổi |

## Quy ước đặt tên file

- Chính sách tháng: `policy_YYYY_MM.md` (ví dụ: `policy_2026_05.md`)
- Sản phẩm: `[category]_[series].md` (ví dụ: `laptops_gaming.md`)
- FAQ: `faq_[topic].md`

## Lưu ý quan trọng

- File chính sách **phải cập nhật đầu mỗi tháng** trước ngày 1
- Giá trong file products là giá đề xuất RSP — giá thực tế tham chiếu chính sách tháng hiện tại
- Mọi thay đổi quan trọng cần commit message rõ ràng để theo dõi lịch sử
