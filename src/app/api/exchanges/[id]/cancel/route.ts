// ============================================================================
// MONOLOOP - POST /api/exchanges/[id]/cancel (Member 4)
// Buyer cancels an active exchange; reserved stock is released.
// Acting organization: x-organization-id header.
// ============================================================================

import { exchangeActionHandler } from '@/features/exchanges/services/http';

export const dynamic = 'force-dynamic';

export const POST = exchangeActionHandler('cancel');
