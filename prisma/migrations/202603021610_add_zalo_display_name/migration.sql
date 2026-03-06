-- Add display name for linked Zalo account
ALTER TABLE users
ADD COLUMN IF NOT EXISTS zalo_display_name VARCHAR(255);

