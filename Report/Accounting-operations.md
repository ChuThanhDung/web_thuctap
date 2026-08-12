# 3 way mathching

3 way matching là đối chiếu 3 bên, 3 chiều và chỉ thanh toán khi trùng khớp cả 3 tài liệu: Đơn đặt hàng(Purchase Orde - PO), Phiếu nhận hàng(GRN), Hóa đơn từ nhà cung cấp(Invoice).

PO: là từ bên mua, xác nhận yêu cầu mua hàng với nhà cung cấp. Bao gồm: Danh sách hàng hóa, số lượng, giá cả, mã PO, ngày giao hàng.

GRN: là từ bên tiếp nhận hàng hóa. Bao gồm: mã GRN, số lượng, tình trạng hàng, ngày nhận, tên người nhận, sai lệch giữa đơn hàng và thực tế.

Invoice: Từ nhà cung cấp gửi đến doanh nghiệp. Bao gồm: Mã Invoice, ngày xuất hóa đơn, danh sách hàng, số lượng, đơn giá, tổng giá trị.

# Quy trình đối chiếu

Kế toán nhận Invoice từ nhà cung cấp -> Kiểm tra Invoice -> Tìm PO tương ứng -> Tìm GRN tương ứng -> Bắt đầu 3 way matching ...

## Nếu Match

Kế toán không thanh toán ngay mà phải thông qua quy trình:

MATCH -> Invoice Validation -> Approval -> Ready for Payment -> Đến hạn thanh toán -> Thanh toán.

## Nếu MisMatch

MISMATCH -> Create Exeption -> Payment Hold/Block -> Phân loại lỗi -> Xác định bên chịu trách nhiệm -> Điều tra nguyên nhân -> Sửa chữa dữ liệu, chứng từ -> Re-Validataion -> Apprvoral -> Thanh toán.

## Các loại lỗi

### Sai số lượng - Quantity Mismatch

Nếu kho nhận đủ nhưng chưa nhập đủ GRN thì phải liên hệ với kho -> xác thực thông tin -> Cập nhật GRN -> Kiểm tra lại -> Match.

Nếu thực tế không nhận đủ hàng thì Invoice sẽ bị đưa vào trạng thái On Hold và cần phải phối hợp các bên để điều tra.

### Sai đơn giá - Price Mismatch

Nếu giá không đúng theo thoản thuận -> Liên hệ với nhà cung cấp -> Sửa hóa đơn -> Cập nhật -> Match.

### Chênh lệch - Tolerance

Nếu sai số trong phạm vi cho phép thì sẽ chuyển hoá đơn sang trạng thái Match_Within_Tolerance.

### Không có GRN - Missing Receipt

Kế toán sẽ cần phải liên hệ với kho nhận hàng. Nếu hàng đã về thì kho sễ phải cập nhật GRN, còn nếu chưa thì Invoice sẽ tiếp tục bị Hold.

### Hàng giao nhiều lần - Partial Delivary


### Invoice vượt quá số lượng đã nhận

Invoice vẫn sẽ tồn tại trong hệ thống nhưng không được thanh toán cho đến khi vẫn đề được giải quyết.

### Sai tên nhà cung cấp - Vendor Mismatch 

Đây là lỗi nghiêm trọng cần phải kiểm tra ngay

### Trung lặp hóa đơn - Duplicate Invoice 


### Sai tổng số tiền 


### Thuế 


### PO không tồn tại 

Hệ thống báo không tìm thấy PO, cần kế toán kiểm tra và xác nhận lại

# Workflow đầy đủ

## Quy trình xử lý sau 3-Way Matching

```text
3-WAY MATCH
       ↓
┌─────────────────────────────────────────────┐
│                                             │
▼                                             ▼
MATCH                                  VARIANCE DETECTED
│                                             │
▼                                             ▼
CHECK TOLERANCE                        CREATE EXCEPTION
│                                             │
├── EXACT MATCH                               ▼
│                                      PAYMENT BLOCK / HOLD
├── WITHIN TOLERANCE                          │
│                                             ▼
▼                                     DETERMINE ROOT CAUSE
READY FOR APPROVAL                            │
                                              ▼
                                  ASSIGN RESPONSIBLE PARTY
                                              │
                         ┌────────────────────┼────────────────────┐
                         │                    │                    │
                         ▼                    ▼                    ▼
                    WAREHOUSE           PROCUREMENT            SUPPLIER
                         │                    │                    │
                         └────────────────────┼────────────────────┘
                                              │
                                              ▼
                                           RESOLVE
                                              │
                                              ▼
                                         RE-VALIDATE
                                              │
                                              ▼
                                         RE-MATCHING
                                              │
                                   ┌──────────┴──────────┐
                                   │                     │
                                   ▼                     ▼
                                 MATCH             STILL MISMATCH
                                   │                     │
                                   ▼                     └──→ Continue Review
                              RELEASE HOLD
                                   │
                                   ▼
                            READY FOR APPROVAL
                                   │
                                   ▼
                                APPROVE
                                   │
                                   ▼
                                 POSTED
                                   │
                                   ▼
                          READY FOR PAYMENT
