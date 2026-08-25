import uuid
from collections import defaultdict

from fastapi import WebSocket
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.models.notification import Notification
from src.models.role import Role
from src.models.user import User


class NotificationConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[uuid.UUID, set[WebSocket]] = defaultdict(set)

    def connect(self, user_id: uuid.UUID, websocket: WebSocket) -> None:
        self._connections[user_id].add(websocket)

    def disconnect(self, user_id: uuid.UUID, websocket: WebSocket) -> None:
        connections = self._connections.get(user_id)
        if not connections:
            return
        connections.discard(websocket)
        if not connections:
            self._connections.pop(user_id, None)

    async def send_to_user(self, user_id: uuid.UUID, payload: dict) -> None:
        dead_connections: list[WebSocket] = []
        for websocket in tuple(self._connections.get(user_id, ())):
            try:
                await websocket.send_json(payload)
            except Exception:
                dead_connections.append(websocket)
        for websocket in dead_connections:
            self.disconnect(user_id, websocket)


notification_manager = NotificationConnectionManager()


def notification_to_dict(notification: Notification) -> dict:
    return {
        "id": notification.id,
        "kind": notification.kind,
        "title": notification.title,
        "message": notification.message,
        "batch_id": notification.batch_id,
        "action_url": notification.action_url,
        "is_read": notification.read_at is not None,
        "created_at": notification.created_at.isoformat(),
    }


def create_notification(
    db: Session,
    *,
    recipient: User,
    actor: User | None,
    batch_id: int | None,
    kind: str,
    title: str,
    message: str,
    action_url: str | None,
) -> Notification:
    notification = Notification(
        recipient_id=recipient.id,
        actor_id=actor.id if actor else None,
        batch_id=batch_id,
        kind=kind,
        title=title,
        message=message,
        action_url=action_url,
    )
    db.add(notification)
    return notification


def create_notifications_for_role(
    db: Session,
    *,
    role_code: str,
    actor: User | None,
    batch_id: int | None,
    kind: str,
    title: str,
    message: str,
    action_url: str | None,
) -> list[Notification]:
    recipients = db.scalars(
        select(User)
        .join(Role, User.role_id == Role.id)
        .where(Role.code == role_code, func.upper(User.status) == "ACTIVE")
    ).all()
    return [
        create_notification(
            db,
            recipient=recipient,
            actor=actor,
            batch_id=batch_id,
            kind=kind,
            title=title,
            message=message,
            action_url=action_url,
        )
        for recipient in recipients
    ]


async def publish_notifications(db: Session, notifications: list[Notification]) -> None:
    for notification in notifications:
        db.refresh(notification)
        await notification_manager.send_to_user(
            notification.recipient_id,
            {"event": "notification", "notification": notification_to_dict(notification)},
        )
