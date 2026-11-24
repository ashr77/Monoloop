"""Buyer ↔ supplier chat about a listing (Member 1). Participants only.

Acting organization: X-Organization-Id header (demo identity) or the JWT's organization.
GET and POST return the conversation with only the messages after ?after_seq=N, so the polling
client merges new messages into what it already shows.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, status

from app.api.deps import ContainerDep
from app.core.security import require_actor
from app.schemas.chat import ConversationSummary, ConversationView
from app.schemas.common import ApiResponse, ok
from app.schemas.inputs import ChatMessageCreate, ConversationCreate

router = APIRouter(prefix="/api", tags=["chat"])
IdPath = Annotated[str, Path(max_length=64)]
AfterSeq = Annotated[int, Query(ge=0, le=2**62)]


@router.get("/conversations", response_model=ApiResponse[list[ConversationSummary]])
async def list_conversations(request: Request, c: ContainerDep):
    """The acting organization's chats (as buyer or supplier), most recent first."""
    actor = await require_actor(request, c.settings)
    items, unread = await c.chat.list(actor)
    return ok(items, total=len(items), unread_total=unread)


@router.post("/conversations", status_code=status.HTTP_201_CREATED, response_model=ApiResponse[ConversationView])
async def open_conversation(body: ConversationCreate, request: Request, c: ContainerDep):
    """A buyer opens (or reopens) its chat with the supplier of a listing."""
    actor = await require_actor(request, c.settings)
    return ok(await c.chat.open(body.listing_id, actor))


@router.get("/conversations/{conversation_id}", response_model=ApiResponse[ConversationView])
async def get_conversation(conversation_id: IdPath, request: Request, c: ContainerDep, after_seq: AfterSeq = 0):
    actor = await require_actor(request, c.settings)
    return ok(await c.chat.view(conversation_id, actor, after_seq))


@router.post("/conversations/{conversation_id}/messages", status_code=status.HTTP_201_CREATED,
             response_model=ApiResponse[ConversationView])
async def send_message(conversation_id: IdPath, body: ChatMessageCreate, request: Request, c: ContainerDep,
                       after_seq: AfterSeq = 0):
    actor = await require_actor(request, c.settings)
    return ok(await c.chat.send(conversation_id, actor, body.body, after_seq))


@router.post("/conversations/{conversation_id}/read", response_model=ApiResponse[dict])
async def mark_read(conversation_id: IdPath, request: Request, c: ContainerDep):
    """Clears the acting organization's unread count for this chat."""
    actor = await require_actor(request, c.settings)
    await c.chat.mark_read(conversation_id, actor)
    return ok({"conversation_id": conversation_id, "unread": 0})
