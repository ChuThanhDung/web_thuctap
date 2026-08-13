from io import BytesIO
from pathlib import Path
from uuid import UUID, uuid4

from PIL import Image, ImageOps, UnidentifiedImageError

from src.config import get_settings

MAX_AVATAR_BYTES = 5 * 1024 * 1024
AVATAR_SIZE = (512, 512)
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}
FORMAT_BY_EXTENSION = {".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG", ".webp": "WEBP"}
FORMAT_BY_CONTENT_TYPE = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}

# Avatar sources do not need to approach Pillow's much larger default pixel limit.
Image.MAX_IMAGE_PIXELS = 25_000_000


class AvatarValidationError(ValueError):
    pass


def get_avatar_storage_dir() -> Path:
    directory = Path(get_settings().avatar_storage_dir).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def validate_avatar_metadata(filename: str | None, content_type: str | None) -> None:
    extension = Path(filename or "").suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise AvatarValidationError("Chỉ chấp nhận ảnh JPG, JPEG, PNG hoặc WebP.")
    if (content_type or "").lower() not in ALLOWED_CONTENT_TYPES:
        raise AvatarValidationError("MIME type của file không hợp lệ. Chỉ chấp nhận JPEG, PNG hoặc WebP.")


def process_avatar(content: bytes, filename: str | None, content_type: str | None) -> bytes:
    if not content:
        raise AvatarValidationError("File ảnh trống.")
    if len(content) > MAX_AVATAR_BYTES:
        raise AvatarValidationError("Ảnh đại diện không được vượt quá 5 MB.")

    try:
        with Image.open(BytesIO(content)) as image:
            detected_format = (image.format or "").upper()
            if detected_format not in ALLOWED_IMAGE_FORMATS:
                raise AvatarValidationError("Nội dung file không phải ảnh JPEG, PNG hoặc WebP hợp lệ.")
            extension_format = FORMAT_BY_EXTENSION.get(Path(filename or "").suffix.lower())
            content_type_format = FORMAT_BY_CONTENT_TYPE.get((content_type or "").lower())
            if detected_format != extension_format or detected_format != content_type_format:
                raise AvatarValidationError("Định dạng ảnh thực tế không khớp với tên file hoặc MIME type.")

            image.verify()

        with Image.open(BytesIO(content)) as image:
            image.load()
            image = ImageOps.exif_transpose(image)
            if image.mode not in {"RGB", "RGBA"}:
                image = image.convert("RGBA" if "transparency" in image.info else "RGB")

            if image.mode == "RGBA":
                background = Image.new("RGB", image.size, "white")
                background.paste(image, mask=image.getchannel("A"))
                image = background
            else:
                image = image.convert("RGB")

            image = ImageOps.fit(image, AVATAR_SIZE, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
            output = BytesIO()
            image.save(output, format="WEBP", quality=82, method=6, optimize=True)
            return output.getvalue()
    except AvatarValidationError:
        raise
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise AvatarValidationError("File tải lên không phải ảnh hợp lệ hoặc đã bị hỏng.") from exc


def save_avatar(user_id: UUID, webp_content: bytes) -> tuple[str, Path]:
    directory = get_avatar_storage_dir()
    filename = f"{user_id}_{uuid4().hex}.webp"
    destination = directory / filename
    destination.write_bytes(webp_content)
    return f"/api/v1/auth/avatars/{filename}", destination


def resolve_avatar_file(filename: str) -> Path | None:
    if Path(filename).name != filename or not filename.endswith(".webp"):
        return None
    directory = get_avatar_storage_dir()
    candidate = (directory / filename).resolve()
    if candidate.parent != directory or not candidate.is_file():
        return None
    return candidate


def delete_avatar_by_url(avatar_url: str | None) -> None:
    if not avatar_url:
        return
    filename = avatar_url.rsplit("/", 1)[-1]
    avatar_path = resolve_avatar_file(filename)
    if avatar_path:
        avatar_path.unlink(missing_ok=True)
