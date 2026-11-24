-- ============================================================================
-- MONOLOOP - Notification read state
-- Migration: 00010_notification_reads.sql   (run after 00001 → 00009; safe to re-run)
--
-- Notifications (new order, accepted, declined, reserved, completed, cancelled,
-- payment received) are built by the backend from activity_logs and payments,
-- which already exist. This table only remembers which of them each company
-- has opened, so the bell's unread count is the same on every device.
--
-- notification_id is the activity_logs.id, or 'payment:<tran_id>' for payments.
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_reads (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    notification_id TEXT NOT NULL CHECK (char_length(notification_id) BETWEEN 1 AND 120),
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, notification_id)
);

-- Private: with RLS on and no policies, the public anon/authenticated API keys
-- cannot read or write it. The backend (service role or a direct connection) bypasses RLS.
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;
