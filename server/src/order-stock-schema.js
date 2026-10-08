import {DataTypes} from 'sequelize';
import {sequelize} from './db.js';
export const OrderStockLedger=sequelize.define('OrderStockLedger',{
 id:{type:DataTypes.INTEGER,autoIncrement:true,primaryKey:true},businessId:{type:DataTypes.INTEGER,allowNull:false},orderKind:{type:DataTypes.STRING(12),allowNull:false},orderId:{type:DataTypes.INTEGER,allowNull:false},deducted:{type:DataTypes.JSONB,allowNull:false,defaultValue:[]},settled:{type:DataTypes.BOOLEAN,allowNull:false,defaultValue:false},legacy:{type:DataTypes.BOOLEAN,allowNull:false,defaultValue:false}
},{tableName:'order_stock_ledger',indexes:[{unique:true,fields:['orderKind','orderId'],name:'order_stock_identity'}]});
let ready,cutoffs;
export function ensureOrderStockSchema(){
 if(!ready)ready=(async()=>{
  await OrderStockLedger.sync(); // Additive ledger, never alters historical order rows or product stock.
  cutoffs=await sequelize.transaction(async transaction=>{
   await sequelize.query('LOCK TABLE leads, restaurant_orders IN SHARE ROW EXCLUSIVE MODE',{transaction});
   await sequelize.query('CREATE TABLE IF NOT EXISTS order_stock_rollout (id integer PRIMARY KEY CHECK(id=1), "leadMax" integer NOT NULL, "restaurantMax" integer NOT NULL)',{transaction});
   await sequelize.query('INSERT INTO order_stock_rollout (id,"leadMax","restaurantMax") SELECT 1,(SELECT COALESCE(MAX(id),0) FROM leads),(SELECT COALESCE(MAX(id),0) FROM restaurant_orders) ON CONFLICT (id) DO NOTHING',{transaction});
   const [rows]=await sequelize.query('SELECT "leadMax","restaurantMax" FROM order_stock_rollout WHERE id=1',{transaction});return rows[0];
  });
 })().catch(e=>{ready=null;throw e;});return ready;
}
export const historicalOrder=(kind,order)=>{
 if(!cutoffs)throw Error('Inventory rollout is not ready');
 return Number(order.id)<=Number(kind==='lead'?cutoffs.leadMax:cutoffs.restaurantMax);
};
