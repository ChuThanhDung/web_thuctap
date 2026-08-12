import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from src.config import get_settings


def send_otp_email(to_email: str, otp: str) -> bool:
    """
    Gửi mã OTP 6 số qua Email sử dụng SMTP (Gmail hoặc Custom Server).
    Trả về True nếu gửi thành công, False nếu có lỗi/chưa cấu hình.
    """
    settings = get_settings()

    if not settings.smtp_user or not settings.smtp_password:
        print(
            f"[EmailService] WARNING: Chưa cấu hình SMTP_USER / SMTP_PASSWORD trong .env. Mã OTP cho {to_email} là: {otp}"
        )
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[{settings.app_name}] Mã xác thực OTP đổi mật khẩu: {otp}"
    msg["From"] = settings.smtp_from or settings.smtp_user
    msg["To"] = to_email

    text_body = f"""
Xin chào,

Bạn vừa yêu cầu mã OTP để đổi mật khẩu tài khoản hệ thống {settings.app_name}.
Mã OTP của bạn là: {otp}

Mã OTP này có hiệu lực trong vòng 10 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.

Trân trọng,
Đội ngũ {settings.app_name}
"""

    html_body = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa; margin: 0; padding: 20px; }}
    .container {{ max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }}
    .header {{ text-align: center; border-bottom: 1px solid #eef2f6; padding-bottom: 20px; margin-bottom: 20px; }}
    .header h2 {{ color: #0d253d; margin: 0; font-size: 22px; }}
    .otp-box {{ background-color: #f0f4ff; border: 1px dashed #4f46e5; border-radius: 8px; text-align: center; padding: 18px; margin: 24px 0; }}
    .otp-code {{ font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #4f46e5; margin: 0; }}
    .note {{ font-size: 13px; color: #64748b; text-align: center; line-height: 1.5; }}
    .footer {{ text-align: center; font-size: 12px; color: #94a3b8; margin-top: 25px; border-top: 1px solid #eef2f6; padding-top: 15px; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Xác thực đổi mật khẩu</h2>
    </div>
    <p>Xin chào,</p>
    <p>Bạn vừa gửi yêu cầu mã OTP để đổi mật khẩu tài khoản hệ thống <strong>{settings.app_name}</strong> ({to_email}).</p>
    <div class="otp-box">
      <p class="otp-code">{otp}</p>
    </div>
    <p class="note">Mã OTP có hiệu lực trong vòng <strong>10 phút</strong>.<br>Vì lý do bảo mật, tuyệt đối không chia sẻ mã này cho bất kỳ ai.</p>
    <div class="footer">
      <p>Email này được gửi tự động từ hệ thống {settings.app_name}.</p>
    </div>
  </div>
</body>
</html>
"""

    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        if settings.smtp_tls:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                server.starttls()
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        print(f"[EmailService] SUCCESS: Đã gửi email OTP {otp} tới {to_email}")
        return True
    except Exception as e:
        print(f"[EmailService] ERROR: Lỗi khi gửi email OTP tới {to_email}: {e}")
        return False
