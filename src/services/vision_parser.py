import base64
import json
import os
import re
from typing import Any


def parse_vision_document(file_bytes: bytes, filename: str, doc_type_hint: str = "invoice") -> dict[str, Any]:
    """
    Bóc tách tài liệu dạng Ảnh (.png, .jpg) hoặc PDF sử dụng Vision API (Gemini / OpenAI).
    Nếu không có API key hoặc lỗi kết nối, trả về dữ liệu fallback được mô phỏng phù hợp.
    """
    gemini_key = os.getenv("GEMINI_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    ext = os.path.splitext(filename)[1].lower()

    # 1. Thử gọi Gemini Vision API nếu có GEMINI_API_KEY
    if gemini_key:
        try:
            import google.generativeai as genai

            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel("gemini-1.5-flash")

            mime_type = "application/pdf" if ext == ".pdf" else "image/png"
            if ext in [".jpg", ".jpeg"]:
                mime_type = "image/jpeg"

            prompt = f"""
            Bạn là chuyên gia OCR bóc tách hóa đơn, chứng từ kế toán Việt Nam.
            Hãy bóc tách thông tin từ tệp này ({doc_type_hint}) thành JSON có cấu trúc sau:
            {{
                "type": "{doc_type_hint}",
                "invoice_number": "mã hóa đơn nếu có",
                "po_number": "số đơn hàng PO nếu có",
                "grn_number": "số phiếu nhập kho GRN nếu có",
                "issue_date": "YYYY-MM-DD",
                "supplier_name": "tên người bán / nhà cung cấp",
                "supplier_tax_id": "Mã số thuế người bán",
                "buyer_name": "tên người mua",
                "total_amount": 0.0,
                "line_items": [
                    {{
                        "row_index": 1,
                        "item_name": "tên sản phẩm",
                        "sku": "mã SKU nếu có",
                        "unit": "đơn vị tính",
                        "qty": 1.0,
                        "price": 100000.0,
                        "vat_rate_pct": null
                    }}
                ]
            }}
            Chỉ trả về JSON hợp lệ, không bao gồm mã markdown nào khác.
            """

            response = model.generate_content([prompt, {"mime_type": mime_type, "data": file_bytes}])

            raw_text = response.text.strip()
            # Clean markdown codeblocks
            raw_text = re.sub(r"^```json\s*", "", raw_text, flags=re.MULTILINE)
            raw_text = re.sub(r"^```\s*", "", raw_text, flags=re.MULTILINE)
            raw_text = re.sub(r"```$", "", raw_text, flags=re.MULTILINE).strip()

            data = json.loads(raw_text)
            data["type"] = doc_type_hint
            return data
        except Exception as e:
            print(f"[VisionParser] Gemini API call error/fallback: {e}")

    # 2. Thử gọi OpenAI GPT-4o Vision nếu có OPENAI_API_KEY
    if openai_key and ext in [".png", ".jpg", ".jpeg"]:
        try:
            from openai import OpenAI

            client = OpenAI(api_key=openai_key)
            base64_image = base64.b64encode(file_bytes).decode("utf-8")
            mime_type = "image/png" if ext == ".png" else "image/jpeg"

            prompt = f"Bóc tách chứng từ kế toán ({doc_type_hint}) thành JSON. Chỉ trả về JSON hợp lệ."

            response = client.chat.completions.create(
                model="gpt-4o-mini",
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64_image}"}},
                        ],
                    }
                ],
            )
            data = json.loads(response.choices[0].message.content)
            data["type"] = doc_type_hint
            return data
        except Exception as e:
            print(f"[VisionParser] OpenAI Vision API call error: {e}")
            raise ValueError(f"Lỗi khi bóc tách chứng từ bằng OpenAI Vision API: {e}")

    # Bắt buộc phải cấu hình API key để bóc tách tệp dạng Ảnh hoặc PDF, không giả lập mock data
    raise ValueError(
        f"Không thể bóc tách dữ liệu từ tệp PDF/Ảnh '{filename}'. "
        "Bắt buộc phải cấu hình GEMINI_API_KEY hoặc OPENAI_API_KEY trong file .env để bóc tách chứng từ dạng PDF hoặc Hình ảnh."
    )
