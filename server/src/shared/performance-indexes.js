// Additive indexes only. Never drop/rebuild the existing indexes or change data.
export const PERFORMANCE_INDEXES = [
 ['push_subscriptions_business_idx','push_subscriptions','"businessId"'],
 ['products_business_id_cursor_idx','products','"businessId", id DESC'],
 ['products_storefront_cursor_idx','products','"businessId", active, featured DESC, "createdAt" DESC, id DESC'],
 ['leads_business_id_cursor_idx','leads','"businessId", id DESC'],
 ['restaurant_orders_business_id_cursor_idx','restaurant_orders','"businessId", id DESC'],
 ['categories_business_id_cursor_idx','categories','"businessId", id DESC'],
 ['coupons_business_id_cursor_idx','coupons','"businessId", id DESC'],
 ['restaurant_orders_business_created_idx','restaurant_orders','"businessId", "createdAt" DESC'],
 ['users_staff_cursor_idx','users','"managerId", "staffBusinessId", role, id DESC']
];
export async function ensurePerformanceIndexes(db){
 for(const [name,table,columns] of PERFORMANCE_INDEXES){
  await db.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ON ${table} (${columns})`);
 }
}
