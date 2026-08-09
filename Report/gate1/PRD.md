# PRD: AI Agent Đối soát Hóa đơn & Chứng từ Kế toán
### (Invoice Reconciliation Agent)

**Nhóm:** *007* — 4 thành viên
**Mentor:** *Cao Quảng Bình*


---

## 1. Tổng quan (Overview)

AI Agent hỗ trợ bộ phận kế toán của công ty dịch vụ gọi xe tự động hóa việc đối soát hóa đơn với đơn đặt hàng (PO) và phiếu nhập hàng, theo mô hình đối chiếu 3 nguồn dữ liệu (3-way matching) vốn là quy trình chuẩn trong kế toán. Hiện tại, quy trình này được thực hiện hoàn toàn thủ công: kế toán viên phải mở từng hóa đơn, tra cứu PO tương ứng, đối chiếu phiếu nhập hàng, rồi tự tính toán chênh lệch nếu có. Với khối lượng hóa đơn lớn dồn vào cuối tháng, cách làm này vừa tốn thời gian vừa tiềm ẩn rủi ro bỏ sót sai lệch.

Sản phẩm hướng tới là một Agent có khả năng tự đọc hóa đơn, tự đối chiếu, tự phát hiện và giải thích chênh lệch — nhưng luôn chỉ dừng lại ở bước đề xuất, để con người là người đưa ra quyết định cuối cùng trước khi hạch toán hoặc thanh toán.

## 2. Mục tiêu (Goals & Objectives)

Mục tiêu của dự án không chỉ dừng ở việc làm cho nhanh, mà cần giải quyết đúng pain point đã xác định ở bản Brief: khối lượng công việc dồn cuối tháng, dễ sai sót khi làm thủ công, và chậm thanh toán ảnh hưởng đến đối tác. Các mục tiêu cụ thể:

| Mục tiêu | Mô tả |
|---|---|
| Giảm thời gian xử lý | Rút ngắn thời gian đối soát mỗi hóa đơn, đặc biệt ở giai đoạn cao điểm cuối tháng khi khối lượng tăng đột biến |
| Giảm sai sót | Giảm tỷ lệ chênh lệch số liệu bị bỏ sót do con người khi đối chiếu thủ công, nhờ việc so khớp được thực hiện có hệ thống và nhất quán |
| Giảm tải công việc lặp lại | Giải phóng kế toán viên khỏi việc đối chiếu tay từng dòng để họ tập trung vào các case thực sự cần chuyên môn cao |
| Giữ con người làm chủ quyết định | Đảm bảo Agent chỉ dừng ở vai trò đề xuất, không tự động hạch toán hay thanh toán khi chưa có sự phê duyệt của người có thẩm quyền |

## 3. Đối tượng người dùng (User Personas)

**Persona 1 — Kế toán viên (Người dùng chính)**
- Là người trực tiếp thao tác với hệ thống hàng ngày, chịu áp lực lớn nhất vào giai đoạn cuối tháng khi hóa đơn dồn về nhiều
- Pain point hiện tại: phải mở nhiều file/hệ thống khác nhau để đối chiếu, dễ nhầm lẫn hoặc bỏ sót khi làm việc dưới áp lực thời gian
- Kỳ vọng ở sản phẩm: xem nhanh được hóa đơn nào khớp hoàn toàn để duyệt ngay, hóa đơn nào có chênh lệch kèm lý do rõ ràng, và duyệt hàng loạt được với các case đơn giản để tiết kiệm thời gian

**Persona 2 — Kế toán trưởng**
- Là người chịu trách nhiệm cuối cùng về tính chính xác của sổ sách và dòng tiền, không trực tiếp xử lý từng hóa đơn nhưng cần giám sát các trường hợp rủi ro
- Pain point hiện tại: khó có cái nhìn tổng quan về tình trạng đối soát nếu không hỏi trực tiếp từng nhân viên
- Kỳ vọng ở sản phẩm: có được bức tranh tổng thể (bao nhiêu hóa đơn đã xử lý, bao nhiêu còn tồn đọng), và được thông báo riêng với các case giá trị lớn hoặc có dấu hiệu bất thường cần duyệt thêm

## 4. User Stories

- *Là một kế toán viên, tôi muốn tải lên nhiều hóa đơn cùng một lúc, để không phải xử lý từng chứng từ một.
- *Là một kế toán viên, tôi muốn hệ thống tự động đọc hóa đơn và đối chiếu với PO/phiếu nhập hàng, để tôi không phải nhập tay và so sánh thủ công.*
- *Là một kế toán viên, tôi muốn hệ thống tự tìm đúng PO và phiếu nhập tương ứng với từng hóa đơn, để tôi không mất thời gian tra cứu chéo giữa các file.*
- *Là một kế toán viên, tôi muốn thấy rõ hóa đơn nào khớp hoàn toàn để duyệt nhanh, và hóa đơn nào có chênh lệch cần xem kỹ.*
- *Là một kế toán viên, tôi muốn biết lý do vì sao có chênh lệch (giá, số lượng, thuế) thay vì chỉ báo "không khớp".*
- *Là một kế toán viên, tôi muốn xem chênh lệch đến từng dòng hàng, để biết vấn đề nằm ở mặt hàng nào chứ không chỉ ở tổng tiền.*
- *Là một kế toán viên, tôi muốn những chênh lệch nhỏ do làm tròn được tự động bỏ qua theo ngưỡng cho phép, để không mất công xử lý các sai số vô nghĩa.*
- *Là một kế toán viên, tôi muốn hệ thống chỉ ra đâu là hóa đơn trùng hoặc hóa đơn không có PO, để tôi phát hiện sớm các trường hợp bất thường.*
- *Là một kế toán viên, tôi muốn duyệt hàng loạt các hóa đơn đã khớp trong một thao tác, để tiết kiệm thời gian vào giai đoạn cao điểm cuối tháng.*
- *Là một kế toán viên, tôi muốn với mỗi chênh lệch được hệ thống gợi ý sẵn hướng xử lý kèm lý do, để tôi quyết định nhanh mà vẫn hiểu căn cứ.*
- *Là một kế toán viên, tôi muốn có thể sửa hoặc từ chối gợi ý của hệ thống, để quyền quyết định cuối cùng vẫn thuộc về tôi.*
- *Là một kế toán viên, tôi muốn hệ thống không cho hạch toán hay thanh toán khi tôi chưa bấm duyệt, để tránh sai sót ngoài ý muốn.*
- *Là một kế toán viên, tôi muốn được cảnh báo khi hệ thống không chắc chắn về dữ liệu trích xuất (ví dụ hóa đơn scan mờ), để tôi kiểm tra lại thủ công thay vì quá tin tưởng vào kết quả tự động.*
- *Là một kế toán viên, tôi muốn xem ảnh hóa đơn gốc ngay cạnh dữ liệu hệ thống đã đọc được, để đối chiếu bằng mắt trong vài giây.*
- *Là một kế toán viên, tôi muốn những hóa đơn hệ thống không xử lý được đưa vào một danh sách riêng, để tôi xử lý tay mà không làm tắc hàng chờ.*
- *Là một kế toán viên, tôi muốn xuất kết quả đã duyệt ra file đúng định dạng của phần mềm kế toán, để không phải nhập lại số liệu lần nữa.*
- *Là một kế toán trưởng, tôi muốn xem được các case có giá trị lớn hoặc rủi ro cao trước khi duyệt, thay vì phải rà soát toàn bộ danh sách.*
- *Là một kế toán trưởng, tôi muốn xem lại lịch sử duyệt hóa đơn nào và lý do duyệt, để phục vụ kiểm tra và giải trình khi cần.*
- *Là một kế toán trưởng, tôi muốn theo dõi tỷ lệ hóa đơn được xử lý tự động và thời gian bình quân xử lý , để đánh giá xem hệ thống có thực sự hiệu quả hay không.*
- *Là một kế toán trưởng, tôi muốn nắm được tiến độ đối soát của cả kỳ (đã xử lý bao nhiêu, còn tồn bao nhiêu), để chủ động điều phối nhân sự trước hạn khóa sổ.*
- *Là một kế toán trưởng, tôi muốn biết những nhà cung cấp nào thường xuyên phát sinh chênh lệch, để làm việc lại với họ thay vì cứ xử lý sự vụ từng lần.*
- *Là một kế toán trưởng, tôi muốn theo dõi tỷ lệ gợi ý của hệ thống bị kế toán viên sửa lại, để biết mức độ tin cậy của hệ thống và quyết định có mở rộng phạm vi áp dụng hay không.*

## 5. Yêu cầu chức năng (Functional Requirements)

### 5.1 Cơ bản (MVP)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-01 | Đọc và trích xuất thông tin từ hóa đơn (tối thiểu 1 định dạng: XML hóa đơn điện tử hoặc PDF có cấu trúc) | Cao |
| FR-02 | Đối chiếu tự động hóa đơn với PO và phiếu nhập hàng theo các trường: số tiền, số lượng, mã hàng | Cao |
| FR-03 | Phát hiện và liệt kê các dòng chênh lệch, kèm mức độ chênh lệch (%, giá trị tuyệt đối) | Cao |
| FR-04 | Hiển thị danh sách kết quả đối soát (khớp / có chênh lệch) cho kế toán xem | Cao |
| FR-05 | Cho phép kế toán duyệt hoặc từ chối từng kết quả trước khi ghi nhận (HITL) | Cao |

### 5.2 Nâng cao (Sau MVP)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-06 | Hỗ trợ hóa đơn dạng ảnh/scan qua OCR | Trung bình |
| FR-07 | Tính confidence score cho từng trường trích xuất, tự động phân loại auto-match vs. cần xem xét | Trung bình |
| FR-08 | Đề xuất nguyên nhân chênh lệch bằng ngôn ngữ tự nhiên | Trung bình |
| FR-09 | Dashboard theo dõi tỷ lệ tự động hóa, thời gian xử lý, human override rate | Thấp |
| FR-10 | Cảnh báo rủi ro gian lận (đối chiếu MST với dữ liệu hóa đơn điện tử cơ quan thuế) | Thấp |

## 6. Yêu cầu phi chức năng (Non-functional Requirements)

Bên cạnh chức năng, sản phẩm còn cần đáp ứng các ràng buộc quan trọng vì đây là hệ thống xử lý dữ liệu tài chính — sai sót hoặc lộ dữ liệu ở đây có hậu quả nghiêm trọng hơn nhiều so với một ứng dụng thông thường:

| Loại | Yêu cầu |
|---|---|
| Bảo mật | Dữ liệu tài chính (MST, số tiền, thông tin đối tác) phải được mã hóa khi lưu trữ; giới hạn quyền truy cập theo vai trò (kế toán viên chỉ thấy dữ liệu thuộc phạm vi của mình, kế toán trưởng có quyền xem tổng quan) |
| Độ chính xác | Các phép so khớp số học (cộng trừ nhân chia, so sánh ngưỡng chênh lệch) phải là logic xác định (rule-based), không được giao cho LLM tự tính toán để tránh sai số khó kiểm soát |
| Độ tin cậy | Khi độ tin cậy trích xuất thấp (OCR mờ, thiếu trường dữ liệu), hệ thống phải chủ động cảnh báo thay vì tự suy diễn giá trị và trình bày như thể chắc chắn |
| Hiệu năng/Chi phí | Hệ thống cần xử lý được khối lượng lớn hóa đơn dồn vào cuối tháng trong thời gian hợp lý, đồng thời không phát sinh chi phí compute (gọi LLM/OCR) quá cao so với giá trị mang lại |
| Khả năng kiểm toán (Audit trail) | Mọi quyết định duyệt/từ chối của kế toán, cùng với dữ liệu gốc và kết quả đối soát, cần được lưu vết đầy đủ để phục vụ tra soát hoặc kiểm toán về sau |

## 7. Luồng người dùng (User Flow)

```
1. Hóa đơn được đưa vào hệ thống (upload hoặc tự động nhận từ email/hệ thống hóa đơn điện tử)
2. Hệ thống trích xuất thông tin từ hóa đơn
3. Hệ thống đối chiếu với PO + phiếu nhập hàng tương ứng
4. Hệ thống phân loại:
   a. Khớp hoàn toàn → đưa vào danh sách "sẵn sàng duyệt nhanh"
   b. Có chênh lệch → đưa vào "hàng đợi cần xem xét" kèm giải thích
5. Kế toán viên xem danh sách, duyệt từng case hoặc duyệt hàng loạt (với case khớp hoàn toàn)
6. Case giá trị lớn/rủi ro cao được chuyển cho kế toán trưởng duyệt thêm
7. Sau khi duyệt, hệ thống ghi nhận kết quả để chuyển sang bước hạch toán/thanh toán (ngoài phạm vi Agent)
```

Luồng hoạt động được thiết kế để chỉ gọi con người khi thực sự cần thiết: phần lớn hóa đơn khớp hoàn toàn nên đi qua nhanh với thao tác duyệt tối thiểu, trong khi thời gian và sự chú ý của kế toán viên được dồn vào những case thực sự có vấn đề. 
## 8. Ngoài phạm vi (Out of Scope — giai đoạn MVP)

- Tự động hạch toán vào sổ kế toán hoặc thực hiện thanh toán — đây là ranh giới an toàn quan trọng, không nên tự động hóa ngay cả ở phiên bản hoàn chỉnh nếu chưa có đủ độ tin cậy đã được kiểm chứng
- Tích hợp trực tiếp với hệ thống ERP/kế toán nội bộ (giai đoạn đầu dùng dữ liệu mẫu/import thủ công để chứng minh luồng hoạt động trước khi đầu tư vào tích hợp)
- Phát hiện gian lận nâng cao qua đối chiếu dữ liệu cơ quan thuế
- Hỗ trợ đầy đủ mọi định dạng hóa đơn từ nhiều quốc gia/chuẩn khác nhau

## 9. Success Metrics

Tiêu chí thành công cần đo được cả về mặt hiệu quả kỹ thuật (chất lượng đối soát) lẫn giá trị vận hành thực tế (thời gian và công sức tiết kiệm được), để tránh tình trạng hệ thống "chạy đúng" về mặt kỹ thuật nhưng không thực sự giải quyết pain point ban đầu:

- Tỷ lệ tự động hóa: % hóa đơn được xử lý mà không cần người can thiệp thủ công
- Precision/Recall của việc so khớp (matching), để đảm bảo hệ thống không báo "khớp" nhầm (gây rủi ro thất thoát) cũng không báo "lệch" nhầm quá nhiều (gây phiền cho kế toán)
- Thời gian xử lý trung bình mỗi hóa đơn, so sánh trước và sau khi có Agent
- Human override rate: % đề xuất của Agent bị kế toán sửa lại, dùng để đánh giá mức độ tin cậy thực tế của hệ thống theo thời gian

---

