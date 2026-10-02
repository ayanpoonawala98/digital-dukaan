import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';
process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
const { default: app } = await import('./app.js');
const { User, Business, RestaurantOrder } = await import('./models/index.js');

test('staff can see scoped restaurant orders but cannot access owner writes or a second store', async () => {
  const original = [User.findByPk, Business.findOne, RestaurantOrder.findAndCountAll];
  User.findByPk = async () => ({ id:83, role:'staff', active:true, managerId:7, staffBusinessId:72 });
  Business.findOne = async ({ where }) => where.id === 72 && where.ownerId === 7 ? { id:72, ownerId:7, storeType:'restaurant', name:'A' } : where.id === 73 && where.ownerId === 7 ? { id:73, ownerId:7, storeType:'restaurant', name:'B' } : null;
  RestaurantOrder.findAndCountAll = async () => ({rows:[],count:0});
  const server = app.listen(0);
  const token = jwt.sign({ sub:83 }, process.env.JWT_SECRET), base = `http://127.0.0.1:${server.address().port}/api/owner`;
  const get = async (path, method='GET') => fetch(`${base}${path}`, { method, headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, ...(method === 'POST' ? { body:'{}' } : {}) });
  try {
    const orders = await get('/72/restaurant-orders'); assert.equal(orders.status, 200); assert.deepEqual(await orders.json(), { orders:[], total:0,page:1,pageSize:200 });
    assert.equal((await get('/72/coupons')).status, 403);
    assert.equal((await get('/72/staff')).status, 403);
    assert.equal((await get('/72/business', 'PATCH')).status, 403);
    assert.equal((await get('/73/restaurant-orders')).status, 404);
    assert.equal((await get('/stores', 'POST')).status, 403);
  } finally { [User.findByPk, Business.findOne, RestaurantOrder.findAndCountAll] = original; await new Promise(resolve => server.close(resolve)); }
});

test('owner can provision only scoped staff with a valid email and long temporary password', async () => {
  const { default: bcrypt } = await import('bcryptjs');
  const methods=[User.findByPk, Business.findOne, User.create];
  User.findByPk=async()=>({id:7,role:'owner',active:true});
  Business.findOne=async({where})=>where.id===72&&where.ownerId===7?{id:72,ownerId:7}:null;
  let created=0;
  User.create=async payload=>{created++; assert.equal(payload.role,'staff'); assert.equal(payload.staffBusinessId,72); assert.equal(payload.managerId,7); assert.equal(await bcrypt.compare('longtemporarypassword',payload.passwordHash),true); return {id:91,...payload};};
  const server=app.listen(0), token=jwt.sign({sub:7},process.env.JWT_SECRET), base=`http://127.0.0.1:${server.address().port}/api/owner/72/staff`;
  const post=body=>fetch(base,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{
    assert.equal((await post({name:'Helper',email:'invalid',password:'longtemporarypassword'})).status,400);
    assert.equal((await post({name:'Helper',email:'helper@example.com',password:'short'})).status,400);
    const r=await post({name:'Helper',email:'HELPER@EXAMPLE.COM',password:'longtemporarypassword'});
    assert.equal(r.status,201); assert.equal((await r.json()).staff.email,'helper@example.com');assert.equal(created,1);
  } finally{[User.findByPk,Business.findOne,User.create]=methods;await new Promise(resolve=>server.close(resolve));}
});
