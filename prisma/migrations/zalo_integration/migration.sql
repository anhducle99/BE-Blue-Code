-- Migration: Zalo OA Integration
-- Phase 2: DB Schema Updates

-- 1. Add Zalo fields to users table
ALTER TABLE users 
ADD COLUMN zalo_user_id VARCHAR(255) UNIQUE,
ADD COLUMN zalo_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN zalo_linked_at TIMESTAMP;

-- 2. Create zalo_link_codes table
CREATE TABLE zalo_link_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  expired_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_zalo_link_codes_code ON zalo_link_codes(code);
CREATE INDEX idx_zalo_link_codes_user ON zalo_link_codes(user_id);
CREATE INDEX idx_zalo_link_codes_expired ON zalo_link_codes(expired_at);

-- 3. Create zalo_event_logs for idempotency
CREATE TABLE zalo_event_logs (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL UNIQUE, -- From Zalo webhook
  event_name VARCHAR(100) NOT NULL,
  zalo_user_id VARCHAR(255),
  payload JSONB,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_zalo_event_logs_event_id ON zalo_event_logs(event_id);
CREATE INDEX idx_zalo_event_logs_zalo_user ON zalo_event_logs(zalo_user_id);
CREATE INDEX idx_zalo_event_logs_created ON zalo_event_logs(created_at);

-- 4. Add Zalo config to organizations (optional)
ALTER TABLE organizations 
ADD COLUMN zalo_oa_id VARCHAR(255),
ADD COLUMN zalo_oa_token TEXT;
