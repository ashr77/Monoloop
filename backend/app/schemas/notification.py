"""Notification read model (same shape as Notification in frontend/src/lib/types.ts)."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

NotificationKind = Literal[
    "ORDER_RECEIVED",    # supplier: a buyer ordered your listing / requested your stock
    "ITEM_ACCEPTED",     # buyer: a supplier accepted
    "ITEM_DECLINED",     # buyer: a supplier declined
    "ORDER_RESERVED",    # buyer: every supplier accepted, stock is reserved
    "ORDER_COMPLETED",   # supplier: the buyer confirmed the transfer
    "ORDER_CANCELLED",   # everyone else in the exchange
    "PAYMENT_RECEIVED",  # supplier: the buyer's online payment was verified
]


class Notification(BaseModel):
    id: str
    kind: NotificationKind
    title: str
    message: str
    exchange_id: str
    created_at: str
    read: bool = False


NotificationId = Annotated[str, StringConstraints(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9:_-]+$")]


class MarkNotificationsRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ids: list[NotificationId] = Field(default_factory=list, max_length=200)
    all: bool = False
