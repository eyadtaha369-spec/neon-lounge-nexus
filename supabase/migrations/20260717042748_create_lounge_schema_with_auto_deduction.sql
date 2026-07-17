/*
# GLITCH Lounge — Supabase schema with automatic inventory deduction

## Overview
This migration creates the full backend schema for the GLITCH PlayStation Lounge
Manager and wires up automatic inventory deduction whenever a room session is
closed (status → "completed"). It replaces the previous localStorage-only
persistence with durable Supabase tables.

## New Tables

1. `menu_items`
   - `id` (uuid, PK)
   - `name` (text, not null)
   - `price` (numeric, not null)
   - `created_at` (timestamptz)

2. `inventory_items`
   - `id` (uuid, PK)
   - `name` (text, not null)
   - `unit` (text, not null) — e.g. "g", "ml", "pcs"
   - `current_stock` (numeric, not null, default 0)
   - `minimum_stock_level` (numeric, not null, default 0)
   - `created_at` (timestamptz)

3. `menu_item_ingredients` (the "recipes" table)
   - `id` (uuid, PK)
   - `menu_item_id` (uuid, FK → menu_items ON DELETE CASCADE)
   - `inventory_item_id` (uuid, FK → inventory_items ON DELETE CASCADE)
   - `quantity_needed` (numeric, not null, check > 0)
   - UNIQUE(menu_item_id, inventory_item_id)

4. `rooms`
   - `id` (uuid, PK)
   - `name` (text, not null)
   - `is_vip` (boolean, default false)
   - `hourly_rate` (numeric, not null, default 5)
   - `status` (text, not null, default 'available') — 'available' | 'active'
   - `started_at` (timestamptz, nullable)
   - `split_bill` (boolean, default false)

5. `room_orders`
   - `id` (uuid, PK)
   - `room_id` (uuid, FK → rooms ON DELETE CASCADE)
   - `menu_item_id` (uuid, FK → menu_items)
   - `name` (text, not null) — denormalized snapshot
   - `price` (numeric, not null) — denormalized snapshot
   - `qty` (integer, not null, check > 0)
   - `created_at` (timestamptz)

6. `sessions`
   - `id` (uuid, PK)
   - `room_id` (uuid, FK → rooms)
   - `room_name` (text, not null) — denormalized snapshot
   - `started_at` (timestamptz, not null)
   - `ended_at` (timestamptz, not null)
   - `seconds` (integer, not null)
   - `time_cost` (numeric, not null)
   - `orders_cost` (numeric, not null)
   - `total` (numeric, not null)
   - `created_at` (timestamptz)

## Security (RLS)
This is a single-tenant app with NO sign-in screen. All tables use
`TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)` because the
data is intentionally shared/public (one lounge, one operator). This is the
correct policy for a no-auth app — `authenticated`-only would make every table
appear empty to the anon-key frontend.

## Automatic Stock Deduction
A trigger function `deduct_inventory_on_session_end()` fires AFTER INSERT on
`sessions`. For each room order attached to the closed room, it looks up the
menu item's recipe (menu_item_ingredients) and subtracts
`quantity_needed * order.qty` from `inventory_items.current_stock`.

This is server-side, atomic, and runs with SECURITY DEFINER so it bypasses RLS
to update inventory regardless of the caller's role. The trigger is wrapped in
the same transaction as the session INSERT, so a failure rolls back the session
too — preventing "completed" sessions from silently skipping deduction.

## Important Notes
1. The trigger deducts based on `room_orders` rows for the closed room. The
   frontend must delete or keep those rows consistently; we DELETE them after
   deduction in the same client transaction flow (the trigger runs before the
   client cleanup, so deduction is guaranteed).
2. `current_stock` is allowed to go negative only if the trigger is bypassed;
   normal flow keeps it ≥ 0 because the frontend validates stock before
   allowing orders. We do NOT add a CHECK >= 0 constraint to avoid blocking
   legitimate historical corrections by the operator.
3. All numeric columns use `numeric(12,2)` for money/quantities to avoid float
   drift.
*/

-- ============ MENU ITEMS ============
CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_menu_items" ON menu_items;
CREATE POLICY "anon_select_menu_items" ON menu_items FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_menu_items" ON menu_items;
CREATE POLICY "anon_insert_menu_items" ON menu_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_menu_items" ON menu_items;
CREATE POLICY "anon_update_menu_items" ON menu_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_menu_items" ON menu_items;
CREATE POLICY "anon_delete_menu_items" ON menu_items FOR DELETE
  TO anon, authenticated USING (true);

-- ============ INVENTORY ITEMS ============
CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit text NOT NULL,
  current_stock numeric(12,2) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  minimum_stock_level numeric(12,2) NOT NULL DEFAULT 0 CHECK (minimum_stock_level >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_inventory_items" ON inventory_items;
CREATE POLICY "anon_select_inventory_items" ON inventory_items FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_inventory_items" ON inventory_items;
CREATE POLICY "anon_insert_inventory_items" ON inventory_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_inventory_items" ON inventory_items;
CREATE POLICY "anon_update_inventory_items" ON inventory_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_inventory_items" ON inventory_items;
CREATE POLICY "anon_delete_inventory_items" ON inventory_items FOR DELETE
  TO anon, authenticated USING (true);

-- ============ MENU ITEM INGREDIENTS (recipes) ============
CREATE TABLE IF NOT EXISTS menu_item_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity_needed numeric(12,2) NOT NULL CHECK (quantity_needed > 0),
  UNIQUE (menu_item_id, inventory_item_id)
);
ALTER TABLE menu_item_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_recipes" ON menu_item_ingredients;
CREATE POLICY "anon_select_recipes" ON menu_item_ingredients FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_recipes" ON menu_item_ingredients;
CREATE POLICY "anon_insert_recipes" ON menu_item_ingredients FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_recipes" ON menu_item_ingredients;
CREATE POLICY "anon_update_recipes" ON menu_item_ingredients FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_recipes" ON menu_item_ingredients;
CREATE POLICY "anon_delete_recipes" ON menu_item_ingredients FOR DELETE
  TO anon, authenticated USING (true);

-- ============ ROOMS ============
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_vip boolean NOT NULL DEFAULT false,
  hourly_rate numeric(12,2) NOT NULL DEFAULT 5 CHECK (hourly_rate >= 0),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','active')),
  started_at timestamptz,
  split_bill boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_rooms" ON rooms;
CREATE POLICY "anon_select_rooms" ON rooms FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_rooms" ON rooms;
CREATE POLICY "anon_insert_rooms" ON rooms FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_rooms" ON rooms;
CREATE POLICY "anon_update_rooms" ON rooms FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_rooms" ON rooms;
CREATE POLICY "anon_delete_rooms" ON rooms FOR DELETE
  TO anon, authenticated USING (true);

-- ============ ROOM ORDERS ============
CREATE TABLE IF NOT EXISTS room_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id),
  name text NOT NULL,
  price numeric(12,2) NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE room_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_room_orders" ON room_orders;
CREATE POLICY "anon_select_room_orders" ON room_orders FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_room_orders" ON room_orders;
CREATE POLICY "anon_insert_room_orders" ON room_orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_room_orders" ON room_orders;
CREATE POLICY "anon_update_room_orders" ON room_orders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_room_orders" ON room_orders;
CREATE POLICY "anon_delete_room_orders" ON room_orders FOR DELETE
  TO anon, authenticated USING (true);

-- ============ SESSIONS ============
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id),
  room_name text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  seconds integer NOT NULL CHECK (seconds >= 0),
  time_cost numeric(12,2) NOT NULL,
  orders_cost numeric(12,2) NOT NULL,
  total numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sessions" ON sessions;
CREATE POLICY "anon_select_sessions" ON sessions FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_sessions" ON sessions;
CREATE POLICY "anon_insert_sessions" ON sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_sessions" ON sessions;
CREATE POLICY "anon_update_sessions" ON sessions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_sessions" ON sessions;
CREATE POLICY "anon_delete_sessions" ON sessions FOR DELETE
  TO anon, authenticated USING (true);

-- ============ AUTO-DEDUCTION TRIGGER ============
CREATE OR REPLACE FUNCTION deduct_inventory_on_session_end()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ing RECORD;
BEGIN
  -- For each order on the closed room, deduct recipe ingredients.
  -- Deduction = quantity_needed * order.qty.
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

  -- Clear the room's orders after deduction so the room is clean for reuse.
  DELETE FROM room_orders WHERE room_id = NEW.room_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deduct_inventory_on_session_end ON sessions;
CREATE TRIGGER trg_deduct_inventory_on_session_end
  AFTER INSERT ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION deduct_inventory_on_session_end();

-- ============ SEED DATA ============
-- Menu items (use stable ids so seed is idempotent)
INSERT INTO menu_items (id, name, price) VALUES
  ('11111111-1111-1111-1111-111111111101', 'Espresso', 3.00),
  ('11111111-1111-1111-1111-111111111102', 'Latte', 4.50),
  ('11111111-1111-1111-1111-111111111103', 'Lemonade', 3.50),
  ('11111111-1111-1111-1111-111111111104', 'Soda', 2.00),
  ('11111111-1111-1111-1111-111111111105', 'Chips', 3.00),
  ('11111111-1111-1111-1111-111111111106', 'Water', 1.50)
ON CONFLICT (id) DO NOTHING;

-- Inventory items
INSERT INTO inventory_items (id, name, unit, current_stock, minimum_stock_level) VALUES
  ('22222222-2222-2222-2222-222222222201', 'Espresso Beans', 'g',    1000, 200),
  ('22222222-2222-2222-2222-222222222202', 'Milk',           'ml',   5000, 1000),
  ('22222222-2222-2222-2222-222222222203', 'Sugar',          'g',    2000, 400),
  ('22222222-2222-2222-2222-222222222204', 'Lemon',          'pcs',  40,   8),
  ('22222222-2222-2222-2222-222222222205', 'Soda Cans',      'units',60,   12),
  ('22222222-2222-2222-2222-222222222206', 'Chips Bags',     'units',40,   8),
  ('22222222-2222-2222-2222-222222222207', 'Water Bottles',  'units',80,   16),
  ('22222222-2222-2222-2222-222222222208', 'Cups',           'pcs',  500,  100)
ON CONFLICT (id) DO NOTHING;

-- Recipes
INSERT INTO menu_item_ingredients (menu_item_id, inventory_item_id, quantity_needed) VALUES
  ('11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222201', 18),  -- Espresso: 18g beans
  ('11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222208', 1),   -- Espresso: 1 cup
  ('11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222201', 18),  -- Latte: 18g beans
  ('11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222202', 200), -- Latte: 200ml milk
  ('11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222208', 1),   -- Latte: 1 cup
  ('11111111-1111-1111-1111-111111111103', '22222222-2222-2222-2222-222222222204', 2),   -- Lemonade: 2 lemons
  ('11111111-1111-1111-1111-111111111103', '22222222-2222-2222-2222-222222222203', 20),  -- Lemonade: 20g sugar
  ('11111111-1111-1111-1111-111111111103', '22222222-2222-2222-2222-222222222208', 1),   -- Lemonade: 1 cup
  ('11111111-1111-1111-1111-111111111104', '22222222-2222-2222-2222-222222222205', 1),   -- Soda: 1 can
  ('11111111-1111-1111-1111-111111111104', '22222222-2222-2222-2222-222222222208', 1),   -- Soda: 1 cup
  ('11111111-1111-1111-1111-111111111105', '22222222-2222-2222-2222-222222222206', 1),   -- Chips: 1 bag
  ('11111111-1111-1111-1111-111111111106', '22222222-2222-2222-2222-222222222207', 1)    -- Water: 1 bottle
ON CONFLICT (menu_item_id, inventory_item_id) DO NOTHING;

-- Rooms (8 standard + 1 VIP)
INSERT INTO rooms (id, name, is_vip, hourly_rate, status) VALUES
  ('33333333-3333-3333-3333-333333333301', 'Room 1', false, 5, 'available'),
  ('33333333-3333-3333-3333-333333333302', 'Room 2', false, 5, 'available'),
  ('33333333-3333-3333-3333-333333333303', 'Room 3', false, 5, 'available'),
  ('33333333-3333-3333-3333-333333333304', 'Room 4', false, 5, 'available'),
  ('33333333-3333-3333-3333-333333333305', 'Room 5', false, 5, 'available'),
  ('33333333-3333-3333-3333-333333333306', 'Room 6', false, 5, 'available'),
  ('33333333-3333-3333-3333-333333333307', 'Room 7', false, 5, 'available'),
  ('33333333-3333-3333-3333-333333333308', 'Room 8', false, 5, 'available'),
  ('33333333-3333-3333-3333-333333333309', 'VIP',    true,  10, 'available')
ON CONFLICT (id) DO NOTHING;
