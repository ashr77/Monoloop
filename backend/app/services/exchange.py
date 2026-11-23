"""Exchange workflow (Member 4): turns a match proposal into an exchange and drives its lifecycle.

The allocation is recomputed on the server from live inventory instead of being accepted from
the browser, so a client cannot request stock the matching engine would not have proposed
(wrong grade, over budget, ...).
"""

from __future__ import annotations

from app.core.errors import AppError
from app.domain.constants import EXCHANGE_STATUSES
from app.repositories.base import ExchangeActionName, ExchangeFilter, NewExchangeItem, Repositories
from app.schemas.exchange import ExchangeView
from app.schemas.matching import MatchResult
from app.services.matching.service import MatchingService


class ExchangeService:
    def __init__(self, repos: Repositories, matching: MatchingService):
        self.repos = repos
        self.matching = matching

    async def request_listing(self, listing_id: str, quantity: int | None, buyer_id: str) -> ExchangeView:
        if quantity is None or isinstance(quantity, bool) or quantity <= 0:
            raise AppError("VALIDATION_ERROR", "Requested quantity must be a positive whole number.")
        listing = await self.repos.listings.get(listing_id)
        if not listing:
            raise AppError("NOT_FOUND", "Listing was not found.")
        if listing.status != "ACTIVE":
            raise AppError("LISTING_UNAVAILABLE", f"Listing is {listing.status} and cannot be ordered.")
        available = listing.total_quantity - listing.reserved_quantity
        if available <= 0:
            raise AppError("INSUFFICIENT_STOCK", "This listing has no available quantity.")
        if quantity > available:
            raise AppError(
                "INSUFFICIENT_STOCK",
                f"Only {available} piece(s) are still available.",
                {"available": available, "requested": quantity},
            )
        if listing.organization_id == buyer_id:
            raise AppError("VALIDATION_ERROR", "A buyer cannot order its own listing.")
        exchange_id = await self.repos.exchanges.create_listing_order(listing_id, quantity, buyer_id)
        view = await self.get(exchange_id)
        return view

    async def list(self, organization_id: str | None, status: str | None) -> list[ExchangeView]:
        if status and status not in EXCHANGE_STATUSES:
            raise AppError("VALIDATION_ERROR", f"Unknown status '{status}'.")
        return await self.repos.exchanges.list(ExchangeFilter(organization_id, status))

    async def get(self, exchange_id: str) -> ExchangeView:
        view = await self.repos.exchanges.get(exchange_id)
        if not view:
            raise AppError("NOT_FOUND", f"Exchange {exchange_id} was not found.")
        return view

    async def request_from_match(self, requirement_id: str, buyer_id: str) -> tuple[ExchangeView, MatchResult]:
        outcome = await self.matching.match(requirement_id)
        if outcome.kind == "NOT_FOUND":
            raise AppError("NOT_FOUND", f"Requirement {requirement_id} was not found.")
        if outcome.kind == "NOT_OPEN":
            raise AppError("REQUIREMENT_NOT_OPEN", f"Requirement is {outcome.requirement.status}; "
                                                   "only OPEN requirements can start an exchange.")
        if outcome.requirement.organization_id != buyer_id:
            raise AppError("FORBIDDEN_ORGANIZATION",
                           "Only the organization that published this requirement can request an exchange for it.")
        proposal = outcome.result
        if not proposal.allocations:
            raise AppError(
                "NO_ALLOCATION",
                "The matching engine found no compatible, budget-feasible allocation for this requirement.",
                {"matching_status": proposal.matching_status, "budget": proposal.budget.model_dump()},
            )
        items = [NewExchangeItem(a.listing_id, a.allocated_quantity) for a in proposal.allocations]
        exchange_id = await self.repos.exchanges.create(requirement_id, buyer_id, items)
        return await self.get(exchange_id), proposal

    async def act(self, action: ExchangeActionName, exchange_id: str, actor_id: str, item_id: str | None) -> ExchangeView:
        if action in ("accept", "reject") and not item_id:
            raise AppError("VALIDATION_ERROR", "exchange_item_id (UUID) is required.")
        await self.repos.exchanges.act(action, exchange_id, actor_id, item_id)
        return await self.get(exchange_id)
