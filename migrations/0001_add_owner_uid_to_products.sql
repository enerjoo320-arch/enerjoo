-- Enerjoo Migration 0001: Add owner_uid to products table
-- Purpose: Strict product ownership tracking for approved suppliers.
-- Safe: Non-destructive, adds column with NULL default for existing products.
-- Existing products with NULL owner_uid remain exclusively manageable by Admin.

ALTER TABLE products ADD COLUMN owner_uid TEXT DEFAULT NULL;

-- Index for efficient lookup and filtering of products by owner
CREATE INDEX IF NOT EXISTS idx_products_owner_uid ON products(owner_uid);
