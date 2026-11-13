-- Migration 0003: Optional activation status flag for Energy Exchange brands/ranges
-- Safe: Non-destructive schema addition with default active state (1).
-- Does NOT insert any baseline or sample prices.

ALTER TABLE energy_exchange_prices ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
