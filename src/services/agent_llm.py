"""Cửa duy nhất để trợ lý AI gọi mô hình ngôn ngữ (OpenAI Chat Completions).

Trợ lý không bao giờ gửi file chứng từ: chỉ gửi dữ liệu đã trích xuất, đã cắt gọn. Mỗi lần gọi được đếm vào
`AgentMeter` (số lần gọi, token) để ghi vào agent_runs và tính hạn mức.

Test không gọi OpenAI: `app_env == "test"` hoặc thiếu khóa thì `is_available()` là False và hai hàm gọi báo
`AgentAIUnavailableError`. Test muốn có câu trả lời thì thay `complete_json` / `chat_with_tools` bằng hàm giả.
"""

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

from openai import OpenAI

from src.config import get_settings

logger = logging.getLogger(__name__)

# Trợ lý chỉ cần câu trả lời ngắn; chặn trên để một lỗi vòng lặp không đốt credit.
MAX_COMPLETION_TOKENS = 1200
AGENT_TIMEOUT_SECONDS = 45.0


class AgentAIUnavailableError(Exception):
    """Chưa cấu hình AI (thiếu khóa) hoặc đang chạy test, hoặc OpenAI lỗi."""


@dataclass
class AgentMeter:
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    model: str | None = None
    steps: list[str] = field(default_factory=list)

    def add(self, response: Any) -> None:
        self.calls += 1
        self.model = getattr(response, "model", None) or self.model
        usage = getattr(response, "usage", None)
        if usage is not None:
            self.prompt_tokens += getattr(usage, "prompt_tokens", 0) or 0
            self.completion_tokens += getattr(usage, "completion_tokens", 0) or 0


def agent_model() -> str:
    return get_settings().model_name


def is_available() -> bool:
    settings = get_settings()
    return bool(settings.openai_api_key) and settings.app_env != "test"


@lru_cache(maxsize=2)
def _client(api_key: str) -> OpenAI:
    return OpenAI(api_key=api_key, timeout=AGENT_TIMEOUT_SECONDS, max_retries=1)


def _require_client() -> OpenAI:
    if not is_available():
        raise AgentAIUnavailableError("Trợ lý AI chưa được cấu hình trên máy chủ.")
    return _client(get_settings().openai_api_key)


def complete_json(system: str, user: str, schema: dict, meter: AgentMeter, *, name: str = "result") -> dict:
    """Một lần gọi, trả về JSON đúng schema (strict)."""
    client = _require_client()
    try:
        response = client.chat.completions.create(
            model=agent_model(),
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_schema", "json_schema": {"name": name, "schema": schema, "strict": True}},
            max_completion_tokens=MAX_COMPLETION_TOKENS,
            temperature=0.2,
        )
    except Exception as exc:  # noqa: BLE001 - lỗi mạng/quota: báo gọn cho người dùng, ghi log chi tiết
        logger.warning("Trợ lý AI lỗi khi gọi OpenAI: %s", exc)
        raise AgentAIUnavailableError("Không gọi được dịch vụ AI, thử lại sau.") from exc
    meter.add(response)
    content = response.choices[0].message.content or "{}"
    return json.loads(content)


ToolFn = Callable[[dict], Any]


def chat_with_tools(
    system: str,
    messages: list[dict],
    tools: dict[str, tuple[dict, ToolFn]],
    meter: AgentMeter,
    *,
    max_steps: int = 4,
) -> str:
    """Vòng lặp gọi công cụ: mô hình chọn công cụ, ta chạy, đưa kết quả lại, tối đa `max_steps` vòng.

    `tools` = {tên: (JSON schema tham số, hàm chạy)}. Hàm chạy nhận dict tham số, trả về dữ liệu (được JSON hóa,
    cắt gọn). Trả về câu trả lời cuối của mô hình.
    """
    client = _require_client()
    specs = [
        {
            "type": "function",
            "function": {
                "name": tool_name,
                "description": spec.get("description", ""),
                "parameters": spec["parameters"],
            },
        }
        for tool_name, (spec, _fn) in tools.items()
    ]
    conversation: list[dict] = [{"role": "system", "content": system}, *messages]
    for step in range(max_steps + 1):
        last_step = step == max_steps
        try:
            response = client.chat.completions.create(
                model=agent_model(),
                messages=conversation,
                tools=specs,
                # Vòng cuối không cho gọi công cụ nữa: buộc trả lời bằng những gì đã có.
                tool_choice="none" if last_step else "auto",
                max_completion_tokens=MAX_COMPLETION_TOKENS,
                temperature=0.2,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Trợ lý AI lỗi khi gọi OpenAI: %s", exc)
            raise AgentAIUnavailableError("Không gọi được dịch vụ AI, thử lại sau.") from exc
        meter.add(response)
        message = response.choices[0].message
        calls = message.tool_calls or []
        if not calls:
            return (message.content or "").strip()
        conversation.append(
            {
                "role": "assistant",
                "content": message.content or "",
                "tool_calls": [
                    {
                        "id": call.id,
                        "type": "function",
                        "function": {"name": call.function.name, "arguments": call.function.arguments},
                    }
                    for call in calls
                ],
            }
        )
        for call in calls:
            result = run_tool(tools, call.function.name, call.function.arguments, meter)
            conversation.append({"role": "tool", "tool_call_id": call.id, "content": result})
    return ""


MAX_TOOL_RESULT_CHARS = 6000


def run_tool(tools: dict[str, tuple[dict, ToolFn]], name: str, raw_arguments: str, meter: AgentMeter) -> str:
    """Chạy một công cụ theo yêu cầu của mô hình. Lỗi được trả lại cho mô hình dưới dạng chữ, không làm hỏng vòng lặp."""
    meter.steps.append(name)
    if name not in tools:
        return json.dumps({"error": f"Không có công cụ {name}"}, ensure_ascii=False)
    try:
        arguments = json.loads(raw_arguments or "{}")
        result = tools[name][1](arguments if isinstance(arguments, dict) else {})
    except Exception as exc:  # noqa: BLE001
        logger.warning("Công cụ trợ lý %s lỗi: %s", name, exc)
        return json.dumps({"error": "Công cụ lỗi, không có dữ liệu"}, ensure_ascii=False)
    text = json.dumps(result, ensure_ascii=False, default=str)
    if len(text) > MAX_TOOL_RESULT_CHARS:
        text = text[:MAX_TOOL_RESULT_CHARS] + "…(đã cắt bớt)"
    return text
