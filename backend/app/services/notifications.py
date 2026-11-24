"""Notifications for the navbar bell.

Built from what is already recorded: every exchange step writes an activity log with the acting
organization (migrations 00004/00006, mirrored in memory/workflow.py), and verified payments are
in the payments table (00007). Each company sees the events on its own exchanges that someone
else caused. Only "which ones were opened" is stored (notification_reads, migration 00010).
"""

from __future__ import annotations

import logging

from app.core.errors import AppError
from app.repositories.base import Repositories
from app.schemas.exchange import ExchangeView
from app.schemas.notification import Notification, NotificationKind
from app.services.exchange import ExchangeService

logger = logging.getLogger("monoloop.notifications")

FEED_LIMIT = 50


def _num(value: float) -> str:
    return f"{value:,.0f}" if float(value).is_integer() else f"{value:,.2f}"


def _dims(*values: float | None) -> str:
    return "×".join(_num(v) for v in values if v is not None)


class NotificationService:
    def __init__(self, repos: Repositories, exchanges: ExchangeService):
        self.repos = repos
        self.exchanges = exchanges

    # ------------------------------------------------------------------ feed

    async def feed(self, organization_id: str) -> tuple[list[Notification], int]:
        """Latest notifications for one organization (newest first) and how many are unread."""
        views = await self.exchanges.list(organization_id, None)
        ordered: list[tuple[str, int, Notification]] = []
        for ex in views:
            # Events of one exchange can share a timestamp (accepted + reserved): keep log order.
            ordered.extend((n.created_at, seq, n) for seq, n in enumerate(self._for_exchange(ex, organization_id)))
        ordered.sort(key=lambda t: (t[0], t[1]), reverse=True)
        items = [n for _, _, n in ordered[:FEED_LIMIT]]

        read: set[str] = set()
        if items and self.repos.notifications is not None:
            try:
                read = await self.repos.notifications.read_ids(organization_id, [n.id for n in items])
            except AppError as exc:
                # Migration 00010 not applied yet: still show the notifications, all as unread.
                logger.warning("Notification read state unavailable: %s", exc.message)
        for n in items:
            n.read = n.id in read
        return items, sum(1 for n in items if not n.read)

    async def mark_read(self, organization_id: str, ids: list[str], all_: bool) -> int:
        if self.repos.notifications is None:
            raise AppError("SERVICE_UNAVAILABLE", "Notification read state is not available.")
        items, _ = await self.feed(organization_id)
        own = {n.id for n in items}
        # Only ids that are actually in this organization's feed are stored.
        targets = sorted(own if all_ else own.intersection(ids))
        if targets:
            await self.repos.notifications.mark_read(organization_id, targets)
        read_now = set(targets)
        return sum(1 for n in items if not n.read and n.id not in read_now)

    # ------------------------------------------------------------- building

    def _for_exchange(self, ex: ExchangeView, org: str) -> list[Notification]:
        is_buyer = ex.buyer_organization_id == org
        own_items = [i for i in ex.items if i.supplier_organization_id == org]
        is_supplier = bool(own_items)
        if not (is_buyer or is_supplier):
            return []

        names: dict[str, str] = {}
        if ex.buyer:
            names[ex.buyer.id] = ex.buyer.name
        for i in ex.items:
            if i.supplier:
                names[i.supplier.id] = i.supplier.name
        buyer_name = names.get(ex.buyer_organization_id, "The buyer")
        items_by_id = {i.id: i for i in ex.items}

        def describe(items: list) -> str:
            if not items:
                return f"{ex.total_quantity} pcs"
            first = items[0]
            spec = ""
            if first.listing:
                lst = first.listing
                spec = f" · {lst.material_specification} {_dims(lst.length_mm, lst.width_mm, lst.thickness_mm)} mm"
            more = f" + {len(items) - 1} more" if len(items) > 1 else ""
            qty = sum(i.quantity for i in items)
            value = sum(i.subtotal_bdt for i in items)
            return f"{qty} pcs{spec}{more} · ৳{_num(value)}"

        out: list[Notification] = []

        def add(log_id: str, kind: NotificationKind, title: str, message: str, at: str) -> None:
            out.append(Notification(id=log_id, kind=kind, title=title, message=message,
                                    exchange_id=ex.id, created_at=at))

        for log in ex.activity:
            actor = str(log.details.get("actor_organization_id") or "")
            if actor == org:
                continue  # never notify a company about its own action
            actor_name = names.get(actor, "A company")
            item = items_by_id.get(str(log.details.get("exchange_item_id") or ""))
            action = log.action

            if action in ("EXCHANGE_REQUESTED", "DIRECT_LISTING_ORDER") and is_supplier:
                add(log.id, "ORDER_RECEIVED", f"New order from {buyer_name}", describe(own_items), log.created_at)
            elif action == "ITEM_ACCEPTED" and is_buyer:
                # A one-item order goes straight to "reserved": that notification says it all.
                if len(ex.items) > 1:
                    add(log.id, "ITEM_ACCEPTED", f"{actor_name} accepted your order",
                        describe([item] if item else []), log.created_at)
            elif action == "ITEM_REJECTED" and is_buyer:
                add(log.id, "ITEM_DECLINED", f"{actor_name} declined your order",
                    describe([item] if item else []), log.created_at)
            elif action == "EXCHANGE_RESERVED" and is_buyer:
                title = f"{actor_name} accepted your order" if len(ex.items) == 1 else "All suppliers accepted your order"
                step = "Next: pay online, then confirm the transfer." if ex.payment_required else \
                       "Next: confirm the transfer once you have the material."
                add(log.id, "ORDER_RESERVED", title, f"Stock reserved for you. {step}", log.created_at)
            elif action == "EXCHANGE_COMPLETED" and is_supplier:
                add(log.id, "ORDER_COMPLETED", f"{buyer_name} confirmed the transfer",
                    f"Order completed · {describe(own_items)}", log.created_at)
            elif action == "EXCHANGE_CANCELLED":
                add(log.id, "ORDER_CANCELLED", f"{actor_name} cancelled the order",
                    describe(own_items if is_supplier else ex.items), log.created_at)

        pay = ex.payment
        if pay and pay.status == "PAID" and is_supplier and not is_buyer:
            add(f"payment:{pay.tran_id}", "PAYMENT_RECEIVED", f"{buyer_name} paid ৳{_num(pay.amount_bdt)}",
                f"Payment verified · {describe(own_items)}", pay.paid_at or ex.updated_at)
        return out
