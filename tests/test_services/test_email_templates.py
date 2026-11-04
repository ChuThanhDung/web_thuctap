"""Mẫu email dùng chung một khung theo hệ thiết kế; không gửi thật (chặn ở _send_email)."""

from datetime import UTC, datetime

import pytest

import src.services.email as email


@pytest.fixture
def captured(monkeypatch):
    sent = []

    def fake_send(to_email, subject, text_body, html_body, framed=True):
        sent.append(
            {
                "to": to_email,
                "subject": subject,
                "text": text_body,
                "html": email._frame(html_body) if framed else html_body,
            }
        )
        return True

    monkeypatch.setattr(email, "_send_email", fake_send)
    return sent


def test_welcome_email_lists_the_first_steps_and_trial_end(captured):
    email.send_welcome_email(
        "a@example.com", "Phạm Thu Hà", "Công ty <A>", datetime(2026, 11, 18, tzinfo=UTC), "https://app.test"
    )
    message = captured[0]
    assert message["subject"].endswith("Chào mừng Công ty <A>")
    assert "18/11/2026" in message["text"] and "https://app.test/huong-dan" in message["text"]
    assert "Công ty &lt;A&gt;" in message["html"]  # tên công ty được escape trong HTML
    assert "Mời kế toán viên" in message["html"]


def test_every_template_uses_the_shared_frame_and_brand_colours(captured):
    when = datetime(2026, 12, 1, tzinfo=UTC)
    email.send_otp_email("a@example.com", "123456")
    email.send_signup_otp_email("a@example.com", "Công ty A", "654321")
    email.send_invitation_email("a@example.com", "Nam", "Công ty A", "Hà", "Kế toán viên", "https://app.test/x", 7)
    email.send_payment_confirmed_email("a@example.com", "Công ty A", "Pro", 490000, when)
    email.send_renewal_reminder_email("a@example.com", "Công ty A", "Pro", when, "https://app.test/goi")
    for message in captured:
        assert "Đối soát chứng từ" in message["html"]
        assert "#533afd" not in message["html"] and "#2563eb" not in message["html"]
    assert "490.000 đ" in captured[3]["text"]
