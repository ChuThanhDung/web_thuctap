#!/usr/bin/env python3

# Script để sửa lỗi encoding trong file UploadQueue.jsx


# Đọc file với encoding sai (latin-1 để đọc raw bytes)
with open('d:/P-007/frontend/src/pages/UploadQueue.jsx', encoding='latin-1') as f:
    content = f.read()

# Các cặp thay thế từ encoding lỗi sang UTF-8 đúng
replacements = {
    'ÄÆ¡n Ä\'áº·t hÃ ng': 'Đơn đặt hàng',
    'LÆ°u thÃ´ng tin thÃ´ Ä\'Æ¡n Ä\'áº·t hÃ ng lÃ m cÆ¡ sá»Ÿ Ä\'á»\'i chiáº¿u': 'Lưu thông tin đơn đặt hàng làm cơ sở đối chiếu',
    'HÃ³a Ä\'Æ¡n': 'Hóa đơn',
    'KÃ­ch hoáº¡t Ä\'á»\'i soÃ¡t 3 bÃªn chÃ©o trá»±c tiáº¿p tá»« DB': 'Kích hoạt đối soát 3 bên chéo trực tiếp từ DB',
    'Phiáº¿u nháº­p kho': 'Phiếu nhập kho',
    'LÆ°u thÃ´ng tin thá»±c nháº­n lÃ m cÆ¡ sá»Ÿ Ä\'á»\'i chiáº¿u': 'Lưu thông tin thực nhận làm cơ sở đối chiếu',
    'HÃ m load danh sÃ¡ch bá»™ Ä\'á»\'i soÃ¡t thá»±c táº¿ tá»« BE': 'Hàm load danh sách bộ đối soát thực tế từ BE',
    'KhÃ´ng thá»ƒ láº¥y danh sÃ¡ch bá»™ Ä\'á»\'i soÃ¡t:': 'Không thể lấy danh sách bộ đối soát:',
    'Load danh sÃ¡ch láº§n Ä\'áº§u khi render': 'Load danh sách lần đầu khi render',
    'Thiáº¿t láº­p cÆ¡ cháº¿ tá»± Ä\'á»™ng lÃ m má»›i danh sÃ¡ch náº¿u cÃ³ file Ä\'ang xá»­ lÃ½': 'Thiết lập cơ chế tự động làm mới danh sách nếu có file đang xử lý',
    'Upload file lÃªn BE': 'Upload file lên BE',
    'ThÃªm cÃ¡c file má»›i vÃ o UI ngay láº­p tá»©c vá»›i tráº¡ng thÃ¡i \'queued\' Ä\'á»ƒ tá»\'i Æ°u tráº£i nghiá»‡m': 'Thêm các file mới vào UI ngay lập tức với trạng thái \'queued\' để tối ưu trải nghiệm',
    'Tiáº¿n hÃ nh upload tá»«ng file lÃªn BE': 'Tiến hành upload từng file lên BE',
    'Cáº­p nháº­t tráº¡ng thÃ¡i file local thÃ nh \'processing\'': 'Cập nhật trạng thái file local thành \'processing\'',
    'Gá»i API tháº­t, truyá»n kÃ¨m loáº¡i tÃ i liá»‡u Ä\'Ã£ chá»n': 'Gọi API thật, truyền kèm loại tài liệu đã chọn',
    'Load láº¡i danh sÃ¡ch tháº­t tá»« BE Ä\'á»ƒ Ä\'á»"ng bá»™ hÃ³a': 'Load lại danh sách thật từ BE để đồng bộ hóa',
    'ÄÃ¡nh dáº¥u lá»—i náº¿u upload tháº¥t báº¡i': 'Đánh dấu lỗi nếu upload thất bại',
    'Lá»—i táº£i lÃªn': 'Lỗi tải lên',
    'TrÃ¬nh duyá»‡t Ä\'ang cháº·n tab má»›i. Vui lÃ²ng cho phÃ©p pop-up Ä\'á»ƒ xem file.': 'Trình duyệt đang chặn tab mới. Vui lòng cho phép pop-up để xem file.',
    'Äang má»Ÿ file...': 'Đang mở file...',
    'KhÃ´ng thá»ƒ má»Ÿ file nÃ y. Vui lÃ²ng thá»­ láº¡i.': 'Không thể mở file này. Vui lòng thử lại.',
    'Báº¡n cÃ³ cháº¯c cháº¯n muá»\'n xÃ³a file': 'Bạn có chắc chắn muốn xóa file',
    'khÃ´ng?': 'không?',
    'KhÃ´ng thá»ƒ xÃ³a file nÃ y. Vui lÃ²ng thá»­ láº¡i.': 'Không thể xóa file này. Vui lòng thử lại.',
    'Báº¡n cÃ³ cháº¯c cháº¯n muá»\'n xÃ³a batch': 'Bạn có chắc chắn muốn xóa batch',
    'KhÃ´ng thá»ƒ xÃ³a batch nÃ y. Vui lÃ²ng thá»­ láº¡i.': 'Không thể xóa batch này. Vui lòng thử lại.',
    'Táº£i lÃªn & Xá»­ lÃ½ chá»©ng tá»«': 'Tải lên & Xử lý chứng từ',
    'Táº£i lÃªn Ä\'Æ¡n Ä\'áº·t hÃ ng PO, hÃ³a Ä\'Æ¡n (.xml, .pdf, .png) hoáº·c phiáº¿u nháº­p kho GRN Ä\'á»ƒ AI tá»± Ä\'á»™ng bÃ³c tÃ¡ch vÃ  Ä\'á»\'i soÃ¡t.': 'Tải lên đơn đặt hàng PO, hóa đơn (.xml, .pdf, .png) hoặc phiếu nhập kho GRN để AI tự động bóc tách và đối soát.',
    'Báº¥m Ä\'á»ƒ má»Ÿ file': 'Bấm để mở file',
    'XÃ³a file': 'Xóa file',
    'Chưa có chứng từ': 'Chưa có chứng từ',
    'HÃ ng Ä\'á»£i xá»­ lÃ½': 'Hàng đợi xử lý',
    'bá»™': 'bộ',
    'Chá»n má»™t bá»™ Ä\'á»ƒ bá»• sung PO, hÃ³a Ä\'Æ¡n hoáº·c phiáº¿u nháº­p kho cÃ²n thiáº¿u.': 'Chọn một bộ để bổ sung PO, hóa đơn hoặc phiếu nhập kho còn thiếu.',
    'LÃ m má»›i': 'Làm mới',
    'Táº¡o bá»™ má»›i': 'Tạo bộ mới',
    'Äang táº£i danh sÃ¡ch...': 'Đang tải danh sách...',
    'ChÆ°a cÃ³ bá»™ Ä\'á»\'i soÃ¡t nÃ o. HÃ£y kÃ©o file vÃ o vÃ¹ng upload Ä\'á»ƒ táº¡o bá»™ Ä\'áº§u tiÃªn.': 'Chưa có bộ đối soát nào. Hãy kéo file vào vùng upload để tạo bộ đầu tiên.',
    'Äá»§ chá»©ng tá»«': 'Đủ chứng từ',
    'Cáº§n bá»• sung': 'Cần bổ sung',
    'chá»©ng tá»«': 'chứng từ',
    'Xem Ä\'á»\'i soÃ¡t': 'Xem đối soát',
    'Cáº­p nháº­t:': 'Cập nhật:',
    'ChÆ°a cÃ³ chá»©ng tá»«': 'Chưa có chứng từ',
    'XÃ³a batch': 'Xóa batch',
    'Hiá»ƒn thá»‹': 'Hiển thị',
    'Ä\'áº¿n': 'đến',
    'Ä\'á»\'i soÃ¡t': 'đối soát',
}

# Thực hiện thay thế
for old, new in replacements.items():
    content = content.replace(old, new)

# Ghi lại file với UTF-8
with open('d:/P-007/frontend/src/pages/UploadQueue.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("✓ Đã sửa encoding thành công!")
