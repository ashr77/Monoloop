// ============================================================================
// MONOLOOP - POST /api/exchanges/[id]/accept (Member 4)
// Supplier accepts its item; stock is re-checked and reserved atomically. body: { exchange_item_id }
// Acting organization: x-organization-id header.
// ============================================================================

import { exchangeActionHandler } from '@/features/exchanges/services/http';

export const dynamic = 'force-dynamic';

export const POST = exchangeActionHandler('accept');
