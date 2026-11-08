-- Migration: Create energy_exchange_prices table for Enerjoo Solar Platform
-- Target Database: Cloudflare D1 (enerjoo)

CREATE TABLE IF NOT EXISTS energy_exchange_prices (
  price_id TEXT PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'panels',
  brand TEXT NOT NULL,
  product_type TEXT DEFAULT 'Solar Panel',
  price_per_watt REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EGP',
  effective_date TEXT DEFAULT (DATE('now')),
  updated_at TEXT DEFAULT (DATETIME('now')),
  updated_by TEXT DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_exchange_category ON energy_exchange_prices(category);
CREATE INDEX IF NOT EXISTS idx_exchange_brand ON energy_exchange_prices(brand);

-- Baseline Seed Prices for Approved Solar Panel Brands (Single Source of Truth)
INSERT INTO energy_exchange_prices (price_id, category, brand, product_type, price_per_watt, currency, effective_date, updated_at, updated_by)
VALUES
  ('PRICE_PANEL_JINKO', 'panels', 'Jinko', 'Solar Panel', 12.00, 'EGP', DATE('now'), DATETIME('now'), 'system'),
  ('PRICE_PANEL_LONGI', 'panels', 'LONGi Solar', 'Solar Panel', 12.20, 'EGP', DATE('now'), DATETIME('now'), 'system'),
  ('PRICE_PANEL_AIKO', 'panels', 'AIKO', 'Solar Panel', 12.50, 'EGP', DATE('now'), DATETIME('now'), 'system'),
  ('PRICE_PANEL_TRINA', 'panels', 'Trina Solar', 'Solar Panel', 11.90, 'EGP', DATE('now'), DATETIME('now'), 'system'),
  ('PRICE_PANEL_JA_SOLAR', 'panels', 'JA Solar', 'Solar Panel', 11.95, 'EGP', DATE('now'), DATETIME('now'), 'system'),
  ('PRICE_PANEL_RISEN', 'panels', 'Risen', 'Solar Panel', 11.80, 'EGP', DATE('now'), DATETIME('now'), 'system'),
  ('PRICE_PANEL_GCL', 'panels', 'GCL', 'Solar Panel', 11.75, 'EGP', DATE('now'), DATETIME('now'), 'system'),
  ('PRICE_PANEL_SUNTECH', 'panels', 'Suntech', 'Solar Panel', 11.85, 'EGP', DATE('now'), DATETIME('now'), 'system'),
  ('PRICE_PANEL_ASTRONERGY', 'panels', 'Astronergy', 'Solar Panel', 11.90, 'EGP', DATE('now'), DATETIME('now'), 'system'),
  ('PRICE_PANEL_GOKIN', 'panels', 'Gokin', 'Solar Panel', 11.70, 'EGP', DATE('now'), DATETIME('now'), 'system'),
  ('PRICE_PANEL_QUANTUM', 'panels', 'Quantum Solar', 'Solar Panel', 11.80, 'EGP', DATE('now'), DATETIME('now'), 'system'),
  ('PRICE_PANEL_ULICA', 'panels', 'Ulica Solar', 'Solar Panel', 11.75, 'EGP', DATE('now'), DATETIME('now'), 'system'),
  ('PRICE_PANEL_ZNSHINE', 'panels', 'ZNShine Solar', 'Solar Panel', 11.80, 'EGP', DATE('now'), DATETIME('now'), 'system')
ON CONFLICT(price_id) DO NOTHING;
