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


# Khung chung cho mọi email: dải tên sản phẩm, nội dung trên giấy trắng, chân thư có link pháp lý. Màu theo DESIGN.md
# (xanh mẫu biểu #1f4fa3, mực navy #0e1b33, nền xanh giấy #f2f6fc).
EMAIL_FRAME = """
<div style="margin:0;padding:24px 12px;background:#f2f6fc;font-family:Arial,Helvetica,sans-serif;color:#0e1b33">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #dae2ee;border-radius:6px;overflow:hidden">
    <div style="padding:16px 24px;background:#13213d;color:#ffffff;font-size:15px;font-weight:700">
      <span style="display:inline-block;width:14px;height:14px;background:#d9b26a;border-radius:3px;vertical-align:-2px;margin-right:8px"></span>{app_name}
      <span style="font-weight:400;color:#c9d6f0"> · Đối soát chứng từ</span>
    </div>
    <div style="padding:24px;font-size:15px;line-height:1.6">{content}</div>
    <div style="padding:14px 24px;background:#f2f6fc;border-top:1px solid #dae2ee;color:#50607c;font-size:12px;line-height:1.5">
      Email tự động, vui lòng không trả lời trực tiếp.{links}
    </div>
  </div>
</div>
"""


def _frame(content: str) -> str:
    settings = get_settings()
    base = (settings.app_frontend_url or "").rstrip("/")
    links = (
        f'<br><a href="{base}/dieu-khoan" style="color:#1f4fa3">Điều khoản sử dụng</a> · '
        f'<a href="{base}/bao-mat" style="color:#1f4fa3">Chính sách bảo vệ dữ liệu</a>'
        if base
        else ""
    )
    return EMAIL_FRAME.format(app_name=escape(settings.app_name), content=content, links=links)


def _button(url: str, label: str) -> str:
    return (
        f'<p style="margin:24px 0;text-align:center"><a href="{escape(url, quote=True)}" '
        'style="display:inline-block;padding:12px 22px;border-radius:4px;background:#1f4fa3;color:#ffffff;'
        f'text-decoration:none;font-weight:700">{escape(label)}</a></p>'
    )


def _send_email(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str,
    framed: bool = True,
    *,
    reply_to: str | None = None,
    cc: str | None = None,
) -> bool:
    """framed=False khi html_body đã tự có khung đầy đủ (email bộ bị từ chối)."""
    settings = get_settings()
    if framed:
        html_body = _frame(html_body)
    if not is_smtp_configured():
        logger.error("SMTP chưa được cấu hình; không thể gửi email tới %s", to_email)
        return False

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = settings.smtp_from or settings.smtp_user
    message["To"] = to_email
    if reply_to:
        message["Reply-To"] = reply_to
    if cc:
        message["Cc"] = cc
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
    <div>
      <h2>Xác thực đổi mật khẩu</h2>
      <p>Mã OTP của tài khoản <strong>{to_email}</strong> là:</p>
      <p style="padding:18px;text-align:center;font-size:32px;font-weight:700;letter-spacing:6px;background:#e8effa;border-radius:8px;color:#1f4fa3">{otp}</p>
      <p>Mã có hiệu lực trong <strong>{ttl_minutes} phút</strong> và chỉ được sử dụng một lần.</p>
      <p style="color:#50607c">Không chia sẻ mã này với bất kỳ ai.</p>
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
    <div>
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
    return _send_email(to_email, subject, text_body, html_body, framed=False)


def send_signup_otp_email(to_email: str, company_name: str, otp: str) -> bool:
    settings = get_settings()
    ttl_minutes = max(1, settings.password_otp_ttl_seconds // 60)
    subject = f"[{settings.app_name}] Mã xác thực đăng ký"
    text_body = (
        f"Mã xác thực đăng ký công ty {company_name} là: {otp}\n\n"
        f"Mã có hiệu lực trong {ttl_minutes} phút. Nếu bạn không đăng ký, hãy bỏ qua email này."
    )
    html_body = f"""
    <div>
      <h2>Xác thực email đăng ký</h2>
      <p>Mã xác thực để tạo tài khoản cho <strong>{escape(company_name)}</strong>:</p>
      <p style="padding:18px;text-align:center;font-size:32px;font-weight:700;letter-spacing:6px;background:#e8effa;border-radius:8px;color:#1f4fa3">{otp}</p>
      <p>Mã có hiệu lực trong <strong>{ttl_minutes} phút</strong> và chỉ dùng được một lần.</p>
      <p style="color:#50607c">Nếu bạn không đăng ký, hãy bỏ qua email này.</p>
    </div>
    """
    return _send_email(to_email, subject, text_body, html_body)


def send_invitation_email(
    to_email: str, recipient_name: str, company_name: str, inviter_name: str, role_name: str, accept_url: str, days: int
) -> bool:
    settings = get_settings()
    subject = f"[{settings.app_name}] Lời mời tham gia {company_name}"
    text_body = (
        f"Xin chào {recipient_name},\n\n"
        f"{inviter_name} mời bạn tham gia {company_name} trên {settings.app_name} với vai trò {role_name}.\n\n"
        f"Mở đường dẫn sau để đặt mật khẩu (hiệu lực {days} ngày):\n{accept_url}\n"
    )
    html_body = f"""
    <div>
      <h2>Lời mời tham gia {escape(company_name)}</h2>
      <p>Xin chào <strong>{escape(recipient_name)}</strong>,</p>
      <p><strong>{escape(inviter_name)}</strong> mời bạn dùng {escape(settings.app_name)} với vai trò
         <strong>{escape(role_name)}</strong>.</p>
      {_button(accept_url, "Nhận lời mời")}
      <p style="color:#50607c;font-size:13px">Lời mời có hiệu lực {days} ngày. Nếu nút không mở được, dán đường dẫn này vào trình duyệt:<br>
        <a href="{escape(accept_url, quote=True)}" style="word-break:break-all">{escape(accept_url)}</a></p>
    </div>
    """
    return _send_email(to_email, subject, text_body, html_body)


def _format_vnd(amount: int) -> str:
    return f"{amount:,}".replace(",", ".") + " đ"


def send_payment_confirmed_email(to_email: str, company_name: str, plan_name: str, amount: int, expires_at) -> bool:
    settings = get_settings()
    until = expires_at.strftime("%d/%m/%Y")
    subject = f"[{settings.app_name}] Đã nhận thanh toán gói {plan_name}"
    text_body = (
        f"Đã nhận {_format_vnd(amount)} cho gói {plan_name} của {company_name}.\n"
        f"Gói có hiệu lực đến hết ngày {until}. Cảm ơn bạn đã sử dụng {settings.app_name}."
    )
    html_body = f"""
    <div>
      <h2>Đã nhận thanh toán</h2>
      <p>Đã nhận <strong>{_format_vnd(amount)}</strong> cho gói <strong>{escape(plan_name)}</strong> của
         <strong>{escape(company_name)}</strong>.</p>
      <p>Gói có hiệu lực đến hết ngày <strong>{until}</strong>.</p>
      <p style="color:#50607c">Cảm ơn bạn đã sử dụng {escape(settings.app_name)}.</p>
    </div>
    """
    return _send_email(to_email, subject, text_body, html_body)


def send_renewal_reminder_email(to_email: str, company_name: str, plan_name: str, expires_at, renew_url: str) -> bool:
    settings = get_settings()
    until = expires_at.strftime("%d/%m/%Y")
    subject = f"[{settings.app_name}] Gói {plan_name} sắp hết hạn ({until})"
    text_body = (
        f"Gói {plan_name} của {company_name} hết hạn ngày {until}. Sau đó công ty chuyển về gói Free; dữ liệu vẫn giữ "
        f"nguyên nhưng hạn mức thấp hơn.\nGia hạn tại: {renew_url}"
    )
    html_body = f"""
    <div>
      <h2>Gói {escape(plan_name)} sắp hết hạn</h2>
      <p>Gói của <strong>{escape(company_name)}</strong> hết hạn ngày <strong>{until}</strong>. Sau đó công ty chuyển
         về gói Free: dữ liệu vẫn giữ nguyên nhưng hạn mức thấp hơn.</p>
      {_button(renew_url, "Gia hạn gói")}
    </div>
    """
    return _send_email(to_email, subject, text_body, html_body)


def send_deletion_scheduled_email(to_email: str, company_name: str, requested_by: str, scheduled_for) -> bool:
    settings = get_settings()
    when = scheduled_for.strftime("%d/%m/%Y")
    subject = f"[{settings.app_name}] Yêu cầu xóa dữ liệu {company_name}"
    text_body = (
        f"{requested_by} đã yêu cầu xóa toàn bộ dữ liệu của {company_name} trên {settings.app_name}.\n"
        f"Dữ liệu sẽ bị xóa vĩnh viễn ngày {when}. Trước ngày đó có thể hủy yêu cầu và tải toàn bộ dữ liệu ở trang "
        "Dữ liệu & quyền riêng tư.\nNếu không phải bạn yêu cầu, hãy đăng nhập và hủy ngay."
    )
    html_body = f"""
    <div>
      <h2>Yêu cầu xóa dữ liệu công ty</h2>
      <p><strong>{escape(requested_by)}</strong> đã yêu cầu xóa toàn bộ dữ liệu của <strong>{escape(company_name)}</strong>.</p>
      <p>Dữ liệu sẽ bị <strong>xóa vĩnh viễn ngày {when}</strong>. Trước ngày đó có thể hủy yêu cầu và tải toàn bộ dữ liệu
         ở trang Dữ liệu &amp; quyền riêng tư.</p>
      <p style="color:#b42318">Nếu không phải bạn yêu cầu, hãy đăng nhập và hủy ngay.</p>
    </div>
    """
    return _send_email(to_email, subject, text_body, html_body)


def send_welcome_email(to_email: str, full_name: str, company_name: str, trial_ends_at, app_url: str) -> bool:
    """Gửi sau khi đăng ký xong: ba việc nên làm đầu tiên và hạn dùng thử."""
    settings = get_settings()
    until = trial_ends_at.strftime("%d/%m/%Y") if trial_ends_at else ""
    steps = (
        ("Mời kế toán viên", "Trang Quản lý tài khoản → Mời qua email."),
        ("Thử một bộ mẫu", "Trên trang Tổng quan, bấm Tạo bộ mẫu để xem cách hệ thống chỉ ra chỗ lệch."),
        ("Duyệt bộ đầu tiên", "Kế toán viên duyệt trước, bạn duyệt cuối; bộ đã duyệt được khóa thành hồ sơ."),
    )
    subject = f"[{settings.app_name}] Chào mừng {company_name}"
    text_body = (
        f"Xin chào {full_name},\n\n{company_name} đã sẵn sàng trên {settings.app_name}. "
        f"Gói Pro dùng thử đến hết ngày {until}.\n\n"
        + "\n".join(f"{index}. {title}: {detail}" for index, (title, detail) in enumerate(steps, 1))
        + f"\n\nĐăng nhập: {app_url}\nHướng dẫn: {app_url}/huong-dan"
    )
    items = "".join(
        f'<li style="margin:0 0 10px"><strong>{escape(title)}</strong><br><span style="color:#3a4a66">{escape(detail)}</span></li>'
        for title, detail in steps
    )
    html_body = f"""
    <h2 style="margin:0 0 12px;font-size:20px">Chào mừng {escape(company_name)}</h2>
    <p>Xin chào <strong>{escape(full_name)}</strong>, công ty đã sẵn sàng. Gói <strong>Pro</strong> dùng thử đến hết
       ngày <strong>{until}</strong>; sau đó tự chuyển về gói Free, dữ liệu giữ nguyên.</p>
    <p style="margin:20px 0 8px;font-weight:700">Ba việc nên làm đầu tiên</p>
    <ol style="padding-left:20px;margin:0">{items}</ol>
    {_button(app_url, "Mở DocuSync AI")}
    <p style="color:#50607c;font-size:13px">Cần trợ giúp? Xem <a href="{escape(app_url, quote=True)}/huong-dan" style="color:#1f4fa3">hướng dẫn sử dụng</a>.</p>
    """
    return _send_email(to_email, subject, text_body, html_body)


def send_supplier_letter(to_email: str, subject: str, body: str, *, sender: str, organization_name: str) -> bool:
    """Thư người dùng gửi nhà cung cấp qua trợ lý. Nhà cung cấp trả lời thẳng về người gửi (Reply-To), người gửi nhận
    một bản (Cc). Không dùng khung DocuSync: đây là thư của công ty người dùng."""
    footer = f"Thư được gửi qua DocuSync AI thay mặt {organization_name}. Vui lòng trả lời trực tiếp email này."
    text_body = f"{body}\n\n--\n{footer}"
    html_body = (
        '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#0e1b33;'
        f'white-space:pre-wrap">{escape(body)}</div>'
        f'<p style="margin-top:24px;color:#50607c;font-size:12px">{escape(footer)}</p>'
    )
    return _send_email(to_email, subject, text_body, html_body, framed=False, reply_to=sender, cc=sender)
