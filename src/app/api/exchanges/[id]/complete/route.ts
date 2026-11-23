// ============================================================================
// MONOLOOP - POST /api/exchanges/[id]/complete (Member 4)
// Buyer confirms transfer of a fully reserved exchange; inventory is deducted once.
// Acting organization: x-organization-id header.
// ============================================================================

import { exchangeActionHandler } from '@/features/exchanges/services/http';

export const dynamic = 'force-dynamic';

export const POST = exchangeActionHandler('complete');
