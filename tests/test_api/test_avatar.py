from io import BytesIO

import pytest
from PIL import Image
from sqlalchemy import select

from src.models.user import User

pytestmark = pytest.mark.asyncio


async def login(client):
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "accountant@docusync.ai", "password": "123456"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def create_png(size=(900, 600), color=(83, 58, 253)) -> bytes:
    output = BytesIO()
    Image.new("RGB", size, color).save(output, format="PNG")
    return output.getvalue()


def create_webp(size=(600, 900), color=(234, 34, 97)) -> bytes:
    output = BytesIO()
    Image.new("RGB", size, color).save(output, format="WEBP")
    return output.getvalue()


async def test_avatar_upload_requires_authentication(client):
    response = await client.put(
        "/api/v1/auth/me/avatar",
        files={"file": ("avatar.png", create_png(), "image/png")},
    )
    assert response.status_code == 401


async def test_avatar_upload_rejects_fake_image(client):
    headers = await login(client)
    response = await client.put(
        "/api/v1/auth/me/avatar",
        headers=headers,
        files={"file": ("avatar.jpg", b"<?php echo 'not an image'; ?>", "image/jpeg")},
    )
    assert response.status_code == 400
    assert "ảnh" in response.json()["detail"].lower()


async def test_avatar_upload_rejects_mime_mismatch(client):
    headers = await login(client)
    response = await client.put(
        "/api/v1/auth/me/avatar",
        headers=headers,
        files={"file": ("avatar.webp", create_png(), "image/webp")},
    )
    assert response.status_code == 400
    assert "khớp" in response.json()["detail"].lower()


async def test_avatar_upload_converts_and_replaces_old_file(client, db_session, monkeypatch, tmp_path):
    monkeypatch.setenv("AVATAR_STORAGE_DIR", str(tmp_path))

    from src.config import get_settings

    get_settings.cache_clear()
    user = db_session.scalar(select(User).where(User.email == "accountant@docusync.ai"))
    old_avatar_url = user.avatar_url
    headers = await login(client)
    try:
        first_response = await client.put(
            "/api/v1/auth/me/avatar",
            headers=headers,
            files={"file": ("first.png", create_png(), "image/png")},
        )
        assert first_response.status_code == 200
        first_url = first_response.json()["avatar_url"]
        first_path = tmp_path / first_url.rsplit("/", 1)[-1]
        assert first_path.is_file()

        with Image.open(first_path) as image:
            assert image.format == "WEBP"
            assert image.size == (512, 512)

        second_response = await client.put(
            "/api/v1/auth/me/avatar",
            headers=headers,
            files={"file": ("second.webp", create_webp(), "image/webp")},
        )
        assert second_response.status_code == 200
        second_url = second_response.json()["avatar_url"]
        second_path = tmp_path / second_url.rsplit("/", 1)[-1]
        assert second_path.is_file()
        assert not first_path.exists()
        assert first_url != second_url
    finally:
        db_session.expire_all()
        user = db_session.scalar(select(User).where(User.email == "accountant@docusync.ai"))
        user.avatar_url = old_avatar_url
        db_session.commit()
        get_settings.cache_clear()
