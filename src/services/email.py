import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape

from src.config import get_settings

logger = logging.getLogger(__name__)


def is_smtp_configured() -> bool:
    settings = get_settings()
    return bool(settings.smtp_user and settings.smtp_password)


def _send_email(to_email: str, subject: str, text_body: str, html_body: str) -> bool:
    settings = get_settings()
    if not is_smtp_configured():
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
        logger.info("Đã gửi email tới %s", to_email)
        return True
    except (OSError, smtplib.SMTPException):
        logger.exception("Không thể gửi email tới %s", to_email)
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


def send_batch_rejected_email(
    to_email: str,
    recipient_name: str,
    batch_number: str,
    rejected_by: str,
    rejection_note: str,
    rejected_at: str,
    action_url: str | None = None,
) -> bool:
    settings = get_settings()
    action_text = f"\nLink xem batch: {action_url}\n" if action_url else ""
    action_html = (
        f"""
          <div style="margin:0 0 24px;text-align:center">
            <a href="{escape(action_url, quote=True)}" style="display:inline-block;padding:13px 22px;border-radius:8px;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:800">
              Mở batch bị từ chối
            </a>
          </div>
          <p style="margin:-12px 0 24px;text-align:center;font-size:12px;line-height:1.5;color:#64748b">
            Nếu nút không mở được, anh/chị có thể copy đường dẫn này:<br>
            <a href="{escape(action_url, quote=True)}" style="color:#2563eb;text-decoration:underline;word-break:break-all">{escape(action_url)}</a>
          </p>
        """
        if action_url
        else ""
    )
    subject = f"[{settings.app_name}] Batch {batch_number} đã bị từ chối"
    text_body = (
        f"Xin chào {recipient_name},\n\n"
        f"Batch {batch_number} đã bị Kế toán trưởng {rejected_by} từ chối.\n\n"
        f"Lý do từ chối:\n{rejection_note}\n\n"
        f"Thời gian từ chối: {rejected_at}\n\n"
        f"{action_text}\n"
        "Vui lòng kiểm tra lại chứng từ và cập nhật batch nếu cần."
    )
    html_body = f"""
    <div style="margin:0;padding:28px;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbe4f0;border-radius:14px;overflow:hidden;box-shadow:0 12px 30px rgba(15,23,42,0.08)">
        <div style="padding:22px 28px;background:#1e293b;color:#ffffff">
          <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#cbd5e1;font-weight:700">DocusyncAI - AI Đối soát</div>
          <h1 style="margin:10px 0 0;font-size:24px;line-height:1.3;font-weight:800">Thông báo batch bị từ chối</h1>
        </div>

        <div style="padding:28px">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.65">Xin chào <strong>{escape(recipient_name)}</strong>,</p>
          <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#334155">
            Batch đối soát dưới đây đã được Kế toán trưởng <strong style="color:#0f172a">{escape(rejected_by)}</strong> từ chối.
            Vui lòng kiểm tra lại chứng từ và cập nhật thông tin cần thiết.
          </p>

          <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 22px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
            <tr>
              <td style="padding:14px 16px;width:38%;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0">Mã batch</td>
              <td style="padding:14px 16px;font-size:15px;color:#0f172a;font-weight:800;border-bottom:1px solid #e2e8f0">{escape(batch_number)}</td>
            </tr>
            <tr>
              <td style="padding:14px 16px;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;font-weight:700">Thời gian từ chối</td>
              <td style="padding:14px 16px;font-size:15px;color:#0f172a;font-weight:600">{escape(rejected_at)}</td>
            </tr>
          </table>

          <div style="margin:0 0 24px;padding:18px 20px;border:1px solid #fecdd3;border-left:5px solid #e11d48;background:#fff1f2;border-radius:10px">
            <p style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;font-weight:800;color:#be123c">Lý do từ chối</p>
            <p style="margin:0;font-size:16px;line-height:1.65;white-space:pre-wrap;color:#881337;font-weight:600">{escape(rejection_note)}</p>
          </div>

          {action_html}

          <div style="padding:14px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;color:#1e3a8a;font-size:14px;line-height:1.6">
            Đây là email tự động từ hệ thống. Anh/chị vui lòng đăng nhập DocusyncAI để xem chi tiết batch và xử lý lại chứng từ.
          </div>
        </div>

        <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5">
          DocusyncAI - Hóa đơn & Chứng từ<br>
          Vui lòng không trả lời trực tiếp email này.
        </div>
      </div>
    </div>
    """
    return _send_email(to_email, subject, text_body, html_body)
