/*
# Fix snapshot_inventory_for_month — replace invalid FOR-IN-INSERT loop

## Problem
The previous implementation used `FOR count_inserted IN INSERT ... LOOP NULL; END LOOP;`
to capture the affected row count. A FOR-IN loop expects a SELECT query whose
result is iterated; an INSERT (even with ON CONFLICT) is not a row-returning
query in that context, so Postgres raised "cannot open INSERT query as cursor"
when Supabase's rpc() wrapper called `SELECT * FROM snapshot_inventory_for_month(...)`.

## Fix
Rewrite the function body to:
1. Run a plain `INSERT ... SELECT ... ON CONFLICT DO UPDATE` (no FOR loop).
2. Capture the affected row count with `GET DIAGNOSTICS integer_var = ROW_COUNT`.
3. Return that count.

This is valid PL/pgSQL for a function containing DML and returning a scalar.
*/

CREATE OR REPLACE FUNCTION snapshot_inventory_for_month(p_month date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  month_start date := date_trunc('month', p_month)::date;
  month_end date := (date_trunc('month', p_month) + interval '1 month')::date;
  row_count integer;
BEGIN
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
        created_at = now();

  GET DIAGNOSTICS row_count = ROW_COUNT;
  RETURN row_count;
END;
$$;
