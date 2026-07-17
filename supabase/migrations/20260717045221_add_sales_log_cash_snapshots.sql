/*
# GLITCH Lounge — sales log, daily cash, monthly snapshots

## Overview
Adds automated End-of-Day sales tracking, automated cash reconciliation,
and month-by-month historical inventory snapshots on top of the existing
lounge schema.

## New Tables

1. `sales_log`
   - `id` (uuid, PK)
   - `menu_item_id` (uuid, FK → menu_items, nullable so historical rows survive
     menu-item deletion via ON DELETE SET NULL)
   - `menu_item_name` (text, not null) — denormalized snapshot
   - `qty` (integer, not null)
   - `unit_price` (numeric, not null) — denormalized snapshot
   - `total` (numeric, not null)
   - `room_id` (uuid, FK → rooms ON DELETE SET NULL)
   - `room_name` (text, not null) — denormalized snapshot
   - `session_id` (uuid, FK → sessions ON DELETE CASCADE)
   - `sold_at` (timestamptz, not null, default now())
   - Index on `sold_at` for day/month filtering.

2. `daily_cash`
   - `id` (uuid, PK)
   - `day` (date, not null, unique) — one row per calendar day
   - `actual_cash` (numeric, not null, default 0) — entered by staff
   - `updated_at` (timestamptz, default now())

3. `inventory_snapshots`
   - `id` (uuid, PK)
   - `month` (date, not null) — first day of the month being snapshotted
   - `inventory_item_id` (uuid, FK → inventory_items ON DELETE CASCADE)
   - `name` (text, not null) — denormalized snapshot
   - `unit` (text, not null) — denormalized snapshot
   - `stock_level` (numeric, not null) — current_stock at snapshot time
   - `minimum_stock_level` (numeric, not null)
   - `used_this_month` (numeric, not null, default 0) — consumption in the month
   - `created_at` (timestamptz, default now())
   - UNIQUE (month, inventory_item_id)

## Modified Functions
- `deduct_inventory_on_session_end()` — now ALSO inserts one `sales_log` row
  per room order (menu_item_id, qty, unit_price, total, room_id, session_id).
  This makes End-of-Day sales tracking 100% automated: every closed session
  automatically logs all its drink orders as sales.

## New Functions
- `snapshot_inventory_for_month(p_month date)` — SECURITY DEFINER function
  that captures the current stock levels into `inventory_snapshots` for the
  given month (first-of-month). Idempotent: re-running for the same month
  updates the existing rows. Computes `used_this_month` as
  `sum(quantity_needed * qty)` from `sales_log` joined to
  `menu_item_ingredients` for sales within that month. Returns the number of
  rows snapshotted.

## Security
All three tables use single-tenant `TO anon, authenticated` policies with
`USING (true)` / `WITH CHECK (true)` because this is a no-auth app with
intentionally shared data — same pattern as the existing tables.

## Important Notes
1. `sales_log` rows survive menu-item deletion (ON DELETE SET NULL on
   menu_item_id) so historical reports stay intact even if a drink is removed
   from the menu later. The denormalized `menu_item_name` preserves the name.
2. `daily_cash` is keyed by calendar day so the frontend can upsert by day
   without worrying about duplicates.
3. `inventory_snapshots` is keyed by (month, inventory_item_id) so re-running
   the snapshot for the same month refreshes the data instead of duplicating.
*/

-- ============ SALES LOG ============
CREATE TABLE IF NOT EXISTS sales_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  menu_item_name text NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  unit_price numeric(12,2) NOT NULL,
  total numeric(12,2) NOT NULL,
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  room_name text NOT NULL,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  sold_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_log_sold_at ON sales_log (sold_at);
ALTER TABLE sales_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sales_log" ON sales_log;
CREATE POLICY "anon_select_sales_log" ON sales_log FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_sales_log" ON sales_log;
CREATE POLICY "anon_insert_sales_log" ON sales_log FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_sales_log" ON sales_log;
CREATE POLICY "anon_delete_sales_log" ON sales_log FOR DELETE
  TO anon, authenticated USING (true);

-- ============ DAILY CASH ============
CREATE TABLE IF NOT EXISTS daily_cash (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL UNIQUE,
  actual_cash numeric(12,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE daily_cash ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_daily_cash" ON daily_cash;
CREATE POLICY "anon_select_daily_cash" ON daily_cash FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_daily_cash" ON daily_cash;
CREATE POLICY "anon_insert_daily_cash" ON daily_cash FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_daily_cash" ON daily_cash;
CREATE POLICY "anon_update_daily_cash" ON daily_cash FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- ============ INVENTORY SNAPSHOTS ============
CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text NOT NULL,
  stock_level numeric(12,2) NOT NULL,
  minimum_stock_level numeric(12,2) NOT NULL,
  used_this_month numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (month, inventory_item_id)
);
ALTER TABLE inventory_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_inventory_snapshots" ON inventory_snapshots;
CREATE POLICY "anon_select_inventory_snapshots" ON inventory_snapshots FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_inventory_snapshots" ON inventory_snapshots;
CREATE POLICY "anon_insert_inventory_snapshots" ON inventory_snapshots FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_inventory_snapshots" ON inventory_snapshots;
CREATE POLICY "anon_update_inventory_snapshots" ON inventory_snapshots FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_inventory_snapshots" ON inventory_snapshots;
CREATE POLICY "anon_delete_inventory_snapshots" ON inventory_snapshots FOR DELETE
  TO anon, authenticated USING (true);

-- ============ EXTEND AUTO-DEDUCTION TRIGGER ============
CREATE OR REPLACE FUNCTION deduct_inventory_on_session_end()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ing RECORD;
  o RECORD;
BEGIN
  -- 1) Deduct recipe ingredients for each order on the closed room.
  FOR ing IN
    SELECT mi.inventory_item_id AS inv_id,
           mi.quantity_needed * ro.qty AS total_needed
    FROM room_orders ro
    JOIN menu_item_ingredients mi ON mi.menu_item_id = ro.menu_item_id
    WHERE ro.room_id = NEW.room_id
  LOOP
    UPDATE inventory_items
      SET current_stock = current_stock - ing.total_needed
      WHERE id = ing.inv_id;
  END LOOP;

  -- 2) Log each order as a sale for automated End-of-Day reporting.
  FOR o IN
    SELECT id, menu_item_id, name, price, qty, (price * qty) AS line_total
    FROM room_orders
    WHERE room_id = NEW.room_id
  LOOP
    INSERT INTO sales_log
      (menu_item_id, menu_item_name, qty, unit_price, total,
       room_id, room_name, session_id, sold_at)
    VALUES
      (o.menu_item_id, o.name, o.qty, o.price, o.line_total,
       NEW.room_id, NEW.room_name, NEW.id, NEW.ended_at);
  END LOOP;

  -- 3) Clear the room's orders after deduction + logging.
  DELETE FROM room_orders WHERE room_id = NEW.room_id;

  RETURN NEW;
END;
$$;

-- ============ SNAPSHOT FUNCTION ============
CREATE OR REPLACE FUNCTION snapshot_inventory_for_month(p_month date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  month_start date := date_trunc('month', p_month)::date;
  month_end date := (date_trunc('month', p_month) + interval '1 month')::date;
  count_inserted integer := 0;
BEGIN
  FOR count_inserted IN
    -- upsert one row per inventory item
    INSERT INTO inventory_snapshots
      (month, inventory_item_id, name, unit, stock_level, minimum_stock_level, used_this_month)
    SELECT
      month_start,
      i.id,
      i.name,
      i.unit,
      i.current_stock,
      i.minimum_stock_level,
      COALESCE((
        SELECT SUM(mi.quantity_needed * sl.qty)
        FROM sales_log sl
        JOIN menu_item_ingredients mi ON mi.menu_item_id = sl.menu_item_id
        WHERE mi.inventory_item_id = i.id
          AND sl.sold_at >= month_start
          AND sl.sold_at < month_end
      ), 0)
    FROM inventory_items i
    ON CONFLICT (month, inventory_item_id) DO UPDATE
      SET stock_level = EXCLUDED.stock_level,
          minimum_stock_level = EXCLUDED.minimum_stock_level,
          used_this_month = EXCLUDED.used_this_month,
          created_at = now()
  LOOP
    NULL;
  END LOOP;

  RETURN count_inserted;
END;
$$;
