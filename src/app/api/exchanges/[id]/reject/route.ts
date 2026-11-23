// ============================================================================
// MONOLOOP - POST /api/exchanges/[id]/reject (Member 4)
// Supplier declines its item. body: { exchange_item_id }
// Acting organization: x-organization-id header.
// ============================================================================

import { exchangeActionHandler } from '@/features/exchanges/services/http';

export const dynamic = 'force-dynamic';

export const POST = exchangeActionHandler('reject');
