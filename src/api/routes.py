import logging

from fastapi import APIRouter, Depends, HTTPException

from src.agents.graph import agent
from src.api.auth import get_current_user
from src.config import get_settings
from src.models.schemas import ChatRequest, ChatResponse
from src.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


def ensure_agent_chat_enabled() -> None:
    if not get_settings().enable_agent_chat_api:
        raise HTTPException(status_code=404, detail="Not Found")


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, current_user: User = Depends(get_current_user)) -> ChatResponse:
    """Chat với AI agent."""
    ensure_agent_chat_enabled()
    try:
        result = await agent.ainvoke({"query": request.message})
        return ChatResponse(
            response=result.get("response", ""),
            analysis=result.get("analysis", ""),
        )
    except Exception as e:
        logger.exception("Chat agent failed: %s", e)
        raise HTTPException(status_code=500, detail="Không thể xử lý yêu cầu chat. Vui lòng thử lại sau.")


@router.get("/status")
async def agent_status(current_user: User = Depends(get_current_user)):
    """Kiểm tra trạng thái agent."""
    ensure_agent_chat_enabled()
    return {"status": "ready", "agent": "LangGraph Agent v1.0"}
