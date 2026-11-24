-- ============================================================================
-- MONOLOOP - Company accounts & admin approval (Member 4)
-- TSUNAGU Hackathon 2026
-- Migration: 00009_company_accounts.sql   (safe to run more than once)
--
-- One login account = one company. A company signs up with its trade licence
-- number and stays PENDING until a super admin approves it.
--
--   PENDING ──approve──▶ APPROVED
--      └────reject (reason)──▶ REJECTED ──resubmit──▶ PENDING
--
-- Existing demo organizations default to APPROVED. Logins live in Supabase Auth
-- (auth.users); auth_user_id links the company to its login. License number and
-- contact email are only returned to the company itself and to admins.
-- ============================================================================

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'APPROVED'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'));
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS license_number TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS auth_user_id UUID;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- One company per licence, per email and per login.
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_license
    ON organizations (lower(license_number)) WHERE license_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_contact_email
    ON organizations (lower(contact_email)) WHERE contact_email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_auth_user
    ON organizations (auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations (status);
