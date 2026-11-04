"""Mã hóa dữ liệu cá nhân khi lưu (CCCD, địa chỉ, khóa TOTP) bằng Fernet (AES-128-CBC + HMAC-SHA256).

Khóa nằm ở DATA_ENCRYPTION_KEY (Fernet, base64 urlsafe 32 byte). Giá trị đã mã hóa có tiền tố `enc:v1:`; giá trị cũ
chưa mã hóa vẫn đọc được bình thường và được mã hóa lại ở lần khởi động (src.main). Không có khóa thì lưu nguyên văn
(dev/test) và production từ chối khởi động (src.config).

Tra cứu theo CCCD (kiểm tra trùng) dùng `blind_index`: HMAC-SHA256 với khóa con, so khớp được mà không lộ số.
"""

import base64
import hashlib
import hmac
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator

from src.config import get_settings

PREFIX = "enc:v1:"


class DecryptionError(RuntimeError):
    pass


@lru_cache(maxsize=4)
def _fernet(key: str) -> Fernet:
    return Fernet(key.encode())


def _key() -> str:
    return get_settings().data_encryption_key


def is_encrypted(value: str | None) -> bool:
    return bool(value) and value.startswith(PREFIX)


def encrypt(value: str | None) -> str | None:
    if value is None or value == "" or is_encrypted(value):
        return value
    key = _key()
    if not key:
        return value
    return PREFIX + _fernet(key).encrypt(value.encode()).decode()


def decrypt(value: str | None) -> str | None:
    if not is_encrypted(value):
        return value
    key = _key()
    if not key:
        raise DecryptionError("Dữ liệu đã mã hóa nhưng thiếu DATA_ENCRYPTION_KEY.")
    try:
        return _fernet(key).decrypt(value.removeprefix(PREFIX).encode()).decode()
    except InvalidToken as exc:
        raise DecryptionError("Không giải mã được dữ liệu: sai DATA_ENCRYPTION_KEY?") from exc


def blind_index(value: str | None) -> str | None:
    """Dấu vân tay cố định của một giá trị (để tìm trùng). Không có khóa thì dùng khóa rỗng (chỉ dev/test)."""
    if not value:
        return None
    sub_key = hashlib.sha256(b"docusync-blind-index:" + _key().encode()).digest()
    digest = hmac.new(sub_key, value.strip().encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def mask_citizen_id(value: str | None) -> str | None:
    """001234567890 -> 0012****7890. Chỉ hiện đủ khi kế toán trưởng bấm xem (có ghi nhật ký)."""
    if not value:
        return value
    if len(value) <= 8:
        return "*" * len(value)
    return value[:4] + "*" * (len(value) - 8) + value[-4:]


class EncryptedText(TypeDecorator):
    """Cột chữ được mã hóa trong DB, đọc ra là chữ thường."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return encrypt(value)

    def process_result_value(self, value, dialect):
        return decrypt(value)
