"""Exchange payments through SSLCommerz (Member 4).

POST /api/payments/exchanges/{id}            buyer starts payment -> {gateway_url}; browser goes there
POST /api/payments/sslcommerz/success|fail|cancel
                                             the gateway sends the browser back here (form POST);
                                             we validate server-side, then 303 to the frontend
POST /api/payments/sslcommerz/ipn            server-to-server notification (needs a public API URL)
"""

from __future__ import annotations

from typing import Annotated, Literal
from urllib.parse import parse_qsl, urlencode

from fastapi import APIRouter, Path, Request
from fastapi.responses import RedirectResponse

from app.api.deps import ContainerDep
from app.core.security import require_actor
from app.schemas.common import ApiResponse, ok
from app.schemas.payment import PaymentStart

router = APIRouter(prefix="/api/payments", tags=["payments"])
IdPath = Annotated[str, Path(max_length=64)]
_OUTCOME_FIELDS = ("tran_id", "val_id", "status")


@router.post("/exchanges/{exchange_id}", response_model=ApiResponse[PaymentStart])
async def start_payment(exchange_id: IdPath, request: Request, c: ContainerDep):
    """Buyer pays the material value of a RESERVED exchange. Acting organization: X-Organization-Id."""
    actor = await require_actor(request, c.settings)
    return ok(await c.payments.start(exchange_id, actor))


async def _gateway_fields(request: Request) -> dict[str, str]:
    """SSLCommerz posts application/x-www-form-urlencoded; keep only the fields we use."""
    pairs = dict(request.query_params)
    if request.method == "POST":
        pairs.update(parse_qsl((await request.body()).decode("utf-8", "replace"), keep_blank_values=True))
    return {k: str(pairs.get(k, ""))[:128] for k in _OUTCOME_FIELDS}


@router.api_route("/sslcommerz/{kind}", methods=["GET", "POST"], include_in_schema=True)
async def sslcommerz_return(kind: Literal["success", "fail", "cancel", "ipn"], request: Request, c: ContainerDep):
    """Gateway return URL. Posted fields are never trusted: success/IPN are re-validated with the
    gateway's validation API before the payment is marked PAID."""
    result = await c.payments.handle_return(kind, await _gateway_fields(request))
    if kind == "ipn":
        return ok({"outcome": result.outcome})
    params = {"payment": result.outcome}
    if result.payer_organization_id:
        params["as"] = result.payer_organization_id
    if result.exchange_id:
        params["highlight"] = result.exchange_id
    target = f"{c.settings.frontend_url.rstrip('/')}/exchanges?{urlencode(params)}"
    return RedirectResponse(target, status_code=303)
