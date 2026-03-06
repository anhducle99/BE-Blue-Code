-- Add organization scope to call logs (safe, non-destructive)
ALTER TABLE call_logs
ADD COLUMN IF NOT EXISTS organization_id INTEGER;

CREATE INDEX IF NOT EXISTS call_logs_organization_id_idx ON call_logs(organization_id);