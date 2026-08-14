import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from src.config import get_settings

logger = logging.getLogger(__name__)


def _send_email(to_email: str, subject: str, text_body: str, html_body: str) -> bool:
    settings = get_settings()
    if not settings.smtp_user or not settings.smtp_password:
        logger.error("SMTP chưa được cấu hình; không thể gửi email tới %s", to_email)
        return False

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = settings.smtp_from or settings.smtp_user
    message["To"] = to_email
    message.attach(MIMEText(text_body, "plain", "utf-8"))
    message.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        if settings.smtp_tls:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                server.starttls()
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(message)
        else:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(message)
        logger.info("Đã gửi email bảo mật tới %s", to_email)
        return True
    except (OSError, smtplib.SMTPException):
        logger.exception("Không thể gửi email bảo mật tới %s", to_email)
        return False


def send_otp_email(to_email: str, otp: str) -> bool:
    settings = get_settings()
    ttl_minutes = max(1, settings.password_otp_ttl_seconds // 60)
    subject = f"[{settings.app_name}] Mã xác thực đổi mật khẩu"
    text_body = (
        f"Mã OTP đổi mật khẩu của bạn là: {otp}\n\n"
        f"Mã có hiệu lực trong {ttl_minutes} phút và chỉ được sử dụng một lần. "
        "Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email."
    )
    html_body = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#0d253d">
      <h2>Xác thực đổi mật khẩu</h2>
      <p>Mã OTP của tài khoản <strong>{to_email}</strong> là:</p>
      <p style="padding:18px;text-align:center;font-size:32px;font-weight:700;letter-spacing:6px;background:#f0f4ff;border-radius:8px;color:#533afd">{otp}</p>
      <p>Mã có hiệu lực trong <strong>{ttl_minutes} phút</strong> và chỉ được sử dụng một lần.</p>
      <p style="color:#64748d">Không chia sẻ mã này với bất kỳ ai.</p>
    </div>
    """
    return _send_email(to_email, subject, text_body, html_body)


def send_password_changed_email(to_email: str) -> bool:
    settings = get_settings()
    subject = f"[{settings.app_name}] Mật khẩu vừa được thay đổi"
    text_body = (
        "Mật khẩu tài khoản của bạn vừa được thay đổi thành công. "
        "Nếu bạn không thực hiện thao tác này, hãy liên hệ quản trị viên ngay."
    )
    html_body = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#0d253d">
      <h2>Mật khẩu vừa được thay đổi</h2>
      <p>Mật khẩu của tài khoản <strong>{to_email}</strong> đã được cập nhật thành công.</p>
      <p style="color:#b42318">Nếu bạn không thực hiện thao tác này, hãy liên hệ quản trị viên ngay.</p>
    </div>
    """
    return _send_email(to_email, subject, text_body, html_body)
