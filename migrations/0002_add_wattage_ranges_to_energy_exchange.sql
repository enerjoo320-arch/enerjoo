-- Migration 0002: Add Wattage Ranges to Energy Exchange Table
-- Adds min_wattage and max_wattage (NULLABLE) to energy_exchange_prices to support multi-range pricing per brand
-- Preserves legacy flat-price records where min_wattage and max_wattage are NULL

ALTER TABLE energy_exchange_prices ADD COLUMN min_wattage INTEGER;
ALTER TABLE energy_exchange_prices ADD COLUMN max_wattage INTEGER;

-- Composite index on brand and wattage ranges to optimize range matching queries
CREATE INDEX IF NOT EXISTS idx_exchange_brand_range ON energy_exchange_prices(brand, min_wattage, max_wattage);
