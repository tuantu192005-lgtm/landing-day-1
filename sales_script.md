# Kịch bản Chatbot Hỗ trợ Nhân viên MSI
> Brand Voice: Hài hước xen lẫn chuyên nghiệp — tiếng Việt tự nhiên, giữ thuật ngữ chuyên ngành
> Fallback chung: **"Mã này anh Tú cần xác nhận thêm, liên hệ Zalo: 0906840384"**

---

## PHẦN 1 — CÂU CHÀO MỞ ĐẦU

> what's up bro ! 👋
>
> Tui là bot hỗ trợ team MSI — hỏi mã hàng, chính sách, tồn kho hay deal tháng này tui đều trả lời được.
>
> Gợi ý nhanh:
> - 🔍 **Tra mã hàng** — gõ tên/mã: H610M-E, RTX 5090, MAG 274QRF…
> - 💰 **Chiết khấu** — CK NPP/đại lý tháng 05/2026
> - 📦 **Tồn kho** — NPP nào đang có hàng gì
> - 🏢 **NPP** — phân vùng, điều kiện TT, hạn mức
> - 📊 **Target tháng này** — chỉ tiêu của Tú
>
> Không tìm được? → **"Mã này ATus cần xác nhận thêm, liên hệ Zalo: 0906840384"**

---

## PHẦN 2 — TỪ VIẾT TẮT NGÀNH (Bot phải hiểu và giải thích được)

| Viết tắt | Nghĩa đầy đủ | Dùng khi nào |
|---|---|---|
| **NPP** | Nhà Phân Phối | Kênh phân phối cấp 1/2 (DGW, SPC, KTC, NWH, MH, AD) |
| **CK** | Chiết khấu | Discount % theo chính sách tháng |
| **SI** | Sell-in | Doanh số bán vào kho NPP / đại lý |
| **SO** | Sell-out | Doanh số bán ra khỏi kệ tới người dùng cuối |
| **SKU** | Stock Keeping Unit | Mã hàng dùng để đặt/theo dõi tồn kho |
| **RSP** | Recommended Selling Price | Giá đề xuất bán lẻ (giá niêm yết) |
| **BH** | Bảo hành | Thời gian / điều kiện bảo hành |
| **TTBH** | Trung tâm bảo hành | Nơi tiếp nhận bảo hành chính hãng |
| **PO** | Purchase Order | Đơn đặt hàng |
| **KM** | Khuyến mãi | Chương trình ưu đãi / gift |

**Trigger:** npp là gì, ck là gì, so là gì, si là gì, sku, rsp, thuật ngữ, từ viết tắt

---

## PHẦN 3 — TRA CỨU SẢN PHẨM CỤ THỂ

Bot nhận diện tên đầy đủ, tên viết tắt, mã SKU — đều trả về đúng thông tin sản phẩm.

### Nguyên tắc alias (tên viết tắt → sản phẩm thật)

| Gõ bất kỳ cái này | Bot hiểu là |
|---|---|
| H610M-E DDR4 / H610M-E D4 / H610M-E / H610M / Pro H610M | MSI PRO H610M-E DDR4 |
| Z890 Tomahawk / MAG Z890 / Z890 | MSI MAG Z890 TOMAHAWK WIFI |
| PRO Z890 / Z890-A | MSI PRO Z890-A WIFI |
| B860 Tomahawk / MAG B860 / B860 | MSI MAG B860 TOMAHAWK WIFI |
| X870E ACE / MEG X870E / X870E | MSI MEG X870E ACE |
| X870 Tomahawk / MAG X870 / X870 | MSI MAG X870 TOMAHAWK WIFI |
| PRO B850 / B850-P / B850 | MSI PRO B850-P WIFI |
| RTX 5090 / 5090 | MSI GeForce RTX 5090 SUPRIM X 32G |
| RTX 5080 / 5080 | MSI GeForce RTX 5080 GAMING X TRIO 16G |
| RTX 5070 Ti / 5070Ti | MSI GeForce RTX 5070 Ti GAMING X TRIO 16G |
| RTX 5070 / 5070 | MSI GeForce RTX 5070 GAMING X TRIO 12G |
| RTX 5060 Ti / 5060Ti / 5060 Ti | MSI GeForce RTX 5060 Ti GAMING X TRIO 16G |
| RX 9070 XT / 9070XT / 9070 XT | MSI Radeon RX 9070 XT GAMING X TRIO 16G |
| RX 9070 / 9070 | MSI Radeon RX 9070 GAMING X TRIO 16G |
| 321URX / MPG 321 / QD-OLED 32 | MSI MPG 321URX QD-OLED |
| 274QRXW / MPG 274QRXW | MSI MPG 274QRXW |
| 274QRFW / MAG 274QRFW | MSI MAG 274QRFW |
| 274QRF-QD / 274QRF / MAG 274QRF | MSI MAG 274QRF-QD |
| 272C4PF / MAG 272C4PF | MSI MAG 272C4PF |
| G274F | MSI G274F |
| G2412F | MSI G2412F |
| A1000G MAG / MAG A1000G | MSI MAG A1000G PCIE5 |
| A1000G MPG / MPG A1000G | MSI MPG A1000G PCIE5 |
| A850G / MAG A850G | MSI MAG A850G PCIE5 |
| A750GL / MAG A750GL | MSI MAG A750GL PCIE5 |
| A650BN / MAG A650BN | MSI MAG A650BN |
| M580 FROZR 1TB / M580 1T / M580 1TB | MSI SPATIUM M580 FROZR 1TB |
| M580 FROZR 2TB / M580 2T / M580 2TB | MSI SPATIUM M580 FROZR 2TB |
| M480 PRO 1TB / M480 PRO 1T | MSI SPATIUM M480 PRO 1TB |
| M480 PRO 2TB / M480 PRO 2T | MSI SPATIUM M480 PRO 2TB |
| M480 1TB / M480 1T | MSI SPATIUM M480 1TB |
| M370 / M370 1TB | MSI SPATIUM M370 1TB |
| CORELIQUID E360 / E360 | MSI MAG CORELIQUID E360 |
| CORELIQUID E240 / E240 | MSI MAG CORELIQUID E240 |
| CORELIQUID 360R / 360R V2 | MSI MAG CORELIQUID 360R V2 |
| CORELIQUID 240R / 240R V2 | MSI MAG CORELIQUID 240R V2 |
| COREFREEZE 360 / CF360 | MSI MAG COREFREEZE 360 BLACK |
| COREFREEZE 120 / CF120 | MSI MAG COREFREEZE 120 |
| PANO M100R / PANO | MSI MAG PANO M100R PZ |
| FORGE 320R / FORGE 320 | MSI MAG FORGE 320R AIRFLOW |
| FORGE 111R / FORGE 111 | MSI MAG FORGE 111R |
| GUNGNIR 300R / GUNGNIR | MSI MPG GUNGNIR 300R AIRFLOW |
| SEKIRA 500X / SEKIRA | MSI MPG SEKIRA 500X |

### Card thông tin trả về khi hỏi sản phẩm

Bot trả lời theo format chuẩn:
> **[Tên sản phẩm]** — SKU: [mã hàng]
> NPP có hàng: [danh sách]
> Giá RSP: [giá] | Chính sách tháng 05: [CK hoặc chương trình]
> [Ghi chú tư vấn nếu có]

---

## PHẦN 4 — 11 CHỦ ĐỀ THƯỜNG GẶP & TRẢ LỜI

### Q1. Chiết khấu tháng này là bao nhiêu?
**Trigger:** chiết khấu, ck, discount, % tháng này, chính sách giá

> CK tháng 05/2026: VGA 10–15% NPP / 6–10% ĐL · Mainboard 12–18% / 8–13% · LCD 12–18% / 8–13% · Nguồn/Tản/SSD/Case 15–18% / 10–13%. ⚠️ Ngoài khung → Trưởng nhóm duyệt qua email.

---

### Q2. NPP nào đang có hàng?
**Trigger:** còn hàng, tồn kho, NPP nào có, hết hàng, lô này còn

> Phân bổ hạn: RTX 5090 (DGW only) · RTX 5080 (DGW/SPC/MH) · MPG 321URX OLED (DGW/MH) · MEG X870E ACE (DGW, còn lại order).
> Tồn tốt 6/6 NPP: RTX 5060 Ti · RX 9070 · PRO B850 · MAG B860 · M480 PRO 1TB · MAG A850G · CORELIQUID 240R V2 · FORGE 320R.

---

### Q3. Hàng order bao lâu về?
**Trigger:** order, đặt hàng, bao lâu, thời gian giao

> MEG X870E / RTX 5090 → 2–3 tuần · SEKIRA 500X → 1–2 tuần · Hàng thường → 2–4 tuần. Giá tính theo chính sách lúc xuất hóa đơn, không phải lúc đặt cọc.

---

### Q4. Đại lý xin thêm chiết khấu, có duyệt được không?
**Trigger:** xin thêm, vượt khung, deal thêm, ngoài chính sách

> Không được tự duyệt. Ghi rõ lý do → email Trưởng nhóm xin duyệt → chờ confirm email chính thức → mới báo đại lý.

---

### Q5. NPP nào phụ trách khu vực nào?
**Trigger:** khu vực, phân vùng, miền bắc, miền trung, miền nam, đbscl

> Bắc: KTC (DGW/SPC hỗ trợ) · Trung: NWH (DGW hỗ trợ) · TP.HCM: DGW, MH (SPC hỗ trợ) · B2B toàn quốc: SPC · ĐBSCL: AD. TT: cấp 1 Net 30 / cấp 2 Net 15.

---

### Q6. Đơn lớn hơn 100 triệu cần làm gì?
**Trigger:** đơn lớn, trên 100 triệu, hợp đồng, thủ tục

> Tạo Deal CRM + gắn NPP → Trưởng nhóm ký duyệt email → mới confirm với khách. Không confirm miệng trước.

---

### Q7. Khách mua về bị lỗi, xử lý thế nào?
**Trigger:** lỗi, bị hư, đổi hàng, bảo hành, dead pixel

> 7 ngày (linh kiện) / 14 ngày (màn hình): đổi mới nếu lỗi NSX, còn đủ hộp + HĐ. Sau đó: BH 24T (MB/VGA/Case/Nguồn/Tản) · 36T (màn) · 5 năm (SSD). Dead pixel < 3 không đổi, ≥ 3 → đổi mới trong 14 ngày.

---

### Q8. Gợi ý nguồn điện theo GPU?
**Trigger:** nguồn, psu, watt, build, cần nguồn, mấy w

> 5060Ti/RX9070 → A650BN 650W (1,2tr) hoặc A750GL (2,1tr) · 5070/9070XT → A750GL/A850G · 5070Ti/5080 → A850G/A1000G · 5090 → A1000G/MPG A1000G. RTX 5090/5080 bắt buộc dây PCIe 5.0 16-pin.

---

### Q9. Chương trình khuyến mãi tháng 05?
**Trigger:** km, khuyến mãi, combo, push gì, chương trình

> Combo Gaming + MAG → giảm 3% · Mua 3 Katana → tặng balo · Counter ≥5 sản phẩm → 500k/tháng. Push: RTX 5060Ti (CK 15%) · MAG 274QRF-QD (đang sale) · M480 PRO 1TB · FORGE 320R.

---

### Q10. Báo cáo nộp khi nào?
**Trigger:** báo cáo, report, nộp tuần, nộp tháng, deadline

> Thứ Sáu trước 17:00 (hàng tuần) · Ngày 28 (cuối tháng). Format theo mẫu SharePoint. Xin hỗ trợ MKT: email kèm tên ĐL + địa chỉ + doanh số 3 tháng → phản hồi trong 3 ngày làm việc.

---

### Q11. Target tháng này của Tú?
**Trigger:** target, chỉ tiêu, kpi

> MB: 3.000u · VGA: 500u · LCD: 2.000u · PSU: 1.000u

---

## PHẦN 5 — KHI KHÔNG TÌM THẤY THÔNG TIN

> Mã này anh Tú cần xác nhận thêm, liên hệ Zalo: **0906840384**

---

## PHẦN 6 — BẢNG TỪ KHÓA TRIGGER

| Gõ gì | Bot làm gì |
|---|---|
| Tên / mã sản phẩm bất kỳ | Tra cứu product DB → trả card thông tin |
| npp là gì / ck là gì / so / si / sku | Giải thích thuật ngữ ngành |
| chiết khấu, ck, % | → Q1 CK tháng này |
| tồn kho, còn hàng, hết hàng | → Q2 Tồn kho |
| order, đặt hàng, bao lâu | → Q3 Hàng order |
| xin thêm, vượt khung | → Q4 CK ngoài chính sách |
| khu vực, phân vùng, miền | → Q5 Phân vùng NPP |
| đơn lớn, 100 triệu | → Q6 Đơn lớn |
| lỗi, bảo hành, đổi | → Q7 Bảo hành đổi trả |
| nguồn, PSU, watt | → Q8 Gợi ý nguồn |
| km, khuyến mãi, combo | → Q9 Chương trình |
| báo cáo, nộp, deadline | → Q10 Báo cáo |
| target, chỉ tiêu, kpi | → Q11 Target Tú |
| Không khớp gì | → Fallback: anh Tú Zalo 0906840384 |

---

*Cập nhật: 05/2026 — Cập nhật lại đầu mỗi tháng khi có chính sách mới.*
