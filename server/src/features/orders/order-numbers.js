// Public numbers are per store; primary keys and tracking tokens never change.
import { sequelize } from '../../config/db.js';
export async function ensureOrderNumbers() {
  await sequelize.transaction(async transaction => {
    const run = sql => sequelize.query(sql, { transaction });
    // Block inserts briefly while existing orders are numbered once, in chronological order.
    await run('LOCK TABLE leads, restaurant_orders IN SHARE ROW EXCLUSIVE MODE');
    await run('ALTER TABLE leads ADD COLUMN IF NOT EXISTS "orderNumber" integer');
    await run('ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS "orderNumber" integer');
    await run('CREATE TABLE IF NOT EXISTS store_order_counters ("businessId" integer PRIMARY KEY, "lastNumber" integer NOT NULL DEFAULT 0)');
    await run(`WITH all_orders AS (
      SELECT 'lead' AS kind, id, "businessId", "createdAt", "orderNumber" FROM leads
      UNION ALL SELECT 'restaurant', id, "businessId", "createdAt", "orderNumber" FROM restaurant_orders
    ), unnumbered AS (
      SELECT kind,id,"businessId", ROW_NUMBER() OVER(PARTITION BY "businessId" ORDER BY "createdAt",id,kind)::integer AS n
      FROM all_orders WHERE "orderNumber" IS NULL
    ), maxima AS (SELECT "businessId",COALESCE(MAX("orderNumber"),0) AS n FROM all_orders GROUP BY "businessId"), numbered AS (
      SELECT u.kind,u.id,u.n+m.n AS n FROM unnumbered u JOIN maxima m USING ("businessId")
    ), updated_leads AS (UPDATE leads l SET "orderNumber"=n.n FROM numbered n WHERE n.kind='lead' AND l.id=n.id RETURNING l.id)
    UPDATE restaurant_orders r SET "orderNumber"=n.n FROM numbered n WHERE n.kind='restaurant' AND r.id=n.id`);
    await run(`INSERT INTO store_order_counters ("businessId","lastNumber")
      SELECT "businessId",MAX("orderNumber") FROM (SELECT "businessId","orderNumber" FROM leads UNION ALL SELECT "businessId","orderNumber" FROM restaurant_orders) o GROUP BY "businessId"
      ON CONFLICT ("businessId") DO UPDATE SET "lastNumber"=GREATEST(store_order_counters."lastNumber",EXCLUDED."lastNumber")`);
    await run(`CREATE OR REPLACE FUNCTION assign_store_order_number() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO store_order_counters ("businessId","lastNumber") VALUES (NEW."businessId",1)
        ON CONFLICT ("businessId") DO UPDATE SET "lastNumber"=store_order_counters."lastNumber"+1
        RETURNING "lastNumber" INTO NEW."orderNumber";
        RETURN NEW;
      END; $$`);
    for (const table of ['leads','restaurant_orders']) {
      await run(`CREATE UNIQUE INDEX IF NOT EXISTS ${table}_store_number_idx ON ${table} ("businessId","orderNumber")`);
      await run(`DROP TRIGGER IF EXISTS store_order_number ON ${table}`);
      await run(`CREATE TRIGGER store_order_number BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION assign_store_order_number()`);
    }
  });
}
