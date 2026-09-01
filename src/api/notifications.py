import asyncio
import json
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from src.api.auth import get_current_user
from src.database import SessionLocal, get_db
from src.models.notification import Notification
from src.models.schemas import MessageResponse, NotificationListResponse, NotificationOut
from src.models.user import User
from src.services.auth import get_user_by_session_token
from src.services.notifications import notification_manager, notification_to_dict

router = APIRouter(prefix="/notifications", tags=["Notifications"])
NOTIFICATION_VISIBILITY_WINDOW = timedelta(hours=5)


def notification_visibility_cutoff() -> datetime:
    return datetime.now(UTC) - NOTIFICATION_VISIBILITY_WINDOW


def to_notification_out(notification: Notification) -> NotificationOut:
    return NotificationOut(**notification_to_dict(notification))


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    limit: int = Query(default=30, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotificationListResponse:
    cutoff = notification_visibility_cutoff()
    items = db.scalars(
        select(Notification)
        .where(
            Notification.recipient_id == current_user.id,
            Notification.created_at >= cutoff,
        )
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit)
    ).all()
    unread_count = (
        db.scalar(
            select(func.count(Notification.id)).where(
                Notification.recipient_id == current_user.id,
                Notification.read_at.is_(None),
                Notification.created_at >= cutoff,
            )
        )
        or 0
    )
    return NotificationListResponse(
        items=[to_notification_out(item) for item in items],
        unread_count=unread_count,
    )


@router.post("/read-all", response_model=MessageResponse)
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    db.execute(
        update(Notification)
        .where(
            Notification.recipient_id == current_user.id,
            Notification.read_at.is_(None),
        )
        .values(read_at=datetime.now(UTC))
    )
    db.commit()
    return MessageResponse(message="Đã đánh dấu tất cả thông báo là đã đọc.")


@router.post("/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotificationOut:
    notification = db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.recipient_id == current_user.id,
        )
    )
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy thông báo.")
    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
        db.add(notification)
        db.commit()
        db.refresh(notification)
    return to_notification_out(notification)


@router.websocket("/ws")
async def notification_websocket(websocket: WebSocket) -> None:
    await websocket.accept()
    user_id = None
    try:
        raw_message = await asyncio.wait_for(websocket.receive_text(), timeout=10)
        message = json.loads(raw_message)
        if message.get("type") != "authenticate" or not message.get("token"):
            await websocket.close(code=4401)
            return

        with SessionLocal() as db:
            user = get_user_by_session_token(db, str(message["token"]))
            if user is None:
                await websocket.close(code=4401)
                return
            user_id = user.id
            cutoff = notification_visibility_cutoff()
            unread_count = (
                db.scalar(
                    select(func.count(Notification.id)).where(
                        Notification.recipient_id == user_id,
                        Notification.read_at.is_(None),
                        Notification.created_at >= cutoff,
                    )
                )
                or 0
            )

        notification_manager.connect(user_id, websocket)
        await websocket.send_json({"event": "connected", "unread_count": unread_count})

        while True:
            raw_message = await websocket.receive_text()
            message = json.loads(raw_message)
            if message.get("type") == "ping":
                await websocket.send_json({"event": "pong"})
    except (TimeoutError, json.JSONDecodeError):
        await websocket.close(code=4400)
    except WebSocketDisconnect:
        pass
    finally:
        if user_id is not None:
            notification_manager.disconnect(user_id, websocket)
