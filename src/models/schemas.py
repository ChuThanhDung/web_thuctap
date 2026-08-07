from datetime import date

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000, description="Tin nhắn từ user")


class ChatResponse(BaseModel):
    response: str = Field(..., description="Phản hồi từ agent")
    analysis: str = Field(default="", description="Phân tích nội bộ")


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)


class AuthUser(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    role_name: str
    department: str | None = None
    employee_code: str | None = None
    date_of_birth: date | None = None
    address: str | None = None
    citizen_id: str | None = None
    phone: str | None = None
    avatar_url: str | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthUser


class ProfileUpdateRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    date_of_birth: date | None = None
    address: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=20)


class OtpRequestResponse(BaseModel):
    message: str
    dev_otp: str | None = None


class OtpVerifyRequest(BaseModel):
    otp: str = Field(..., min_length=6, max_length=6)


class OtpVerifyResponse(BaseModel):
    reset_token: str


class PasswordChangeRequest(BaseModel):
    reset_token: str = Field(..., min_length=16, max_length=255)
    new_password: str = Field(..., min_length=6, max_length=128)
    confirm_password: str = Field(..., min_length=6, max_length=128)


class MessageResponse(BaseModel):
    message: str
