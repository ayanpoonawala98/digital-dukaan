import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';
process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
const { default: app } = await import('../../app.js');
const { User, Business, Referral, Lead, RestaurantOrder } = await import('../../models/index.js');

test('referral requires a shop-confirmed order, distinct customer, and one-time reward use', async () => {
  const methods = [User.findByPk, Business.findOne, Referral.findOne, Referral.update, Lead.findOne, RestaurantOrder.findOne];
  const referral = { id:3, businessId:72, code:'FR1234567890', referrerPhone:'919111111111', status:'pending', referrerRewardUsed:false, referredRewardUsed:false };
  const lead = { id:4, businessId:72, referralCode:referral.code, status:'new', customerPhone:'919222222222' };
  const restaurant = { id:5, businessId:72, referralCode:referral.code, status:'new', customerPhone:'919222222222' };
  User.findByPk = async () => ({ id:7, role:'owner', active:true });
  Business.findOne = async ({where}) => where.id === 72 && where.ownerId === 7 ? { id:72, ownerId:7, slug:'test-store' } : null;
  Referral.findOne = async ({where}) => where.id === referral.id && where.businessId === 72 && referral.status === where.status ? referral : null;
  Referral.update = async (changes, {where}) => { if (where.status !== referral.status || Object.keys(where).some(k => k.endsWith('RewardUsed') && referral[k] !== where[k])) return [0]; Object.assign(referral, changes); return [1]; };
  Lead.findOne = async ({where}) => where.id === lead.id && where.businessId === 72 && where.referralCode === lead.referralCode ? lead : null;
  RestaurantOrder.findOne = async ({where}) => where.id === restaurant.id && where.businessId === 72 && where.referralCode === restaurant.referralCode ? restaurant : null;
  const server = app.listen(0), base=`http://127.0.0.1:${server.address().port}/api/owner/72/referrals/3`;
  const token=jwt.sign({sub:7},process.env.JWT_SECRET);
  const post=(suffix,body)=>fetch(base+suffix,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  try {
    assert.equal((await post('/confirm',{orderKind:'retail',orderId:4,referredPhone:'919222222222'})).status,400);
    lead.status='confirmed';
    assert.equal((await post('/confirm',{orderKind:'retail',orderId:4,referredPhone:'919111111111'})).status,400);
    assert.equal((await post('/confirm',{orderKind:'retail',orderId:4,referredPhone:'919333333333'})).status,400);
    assert.equal((await post('/confirm',{orderKind:'restaurant',orderId:5,referredPhone:'919222222222'})).status,400);
    lead.customerPhone=''; assert.equal((await post('/confirm',{orderKind:'retail',orderId:4,referredPhone:'919222222222'})).status,400); lead.customerPhone='919222222222';
    lead.customerPhone='+91 9222222222';
    assert.equal((await post('/confirm',{orderKind:'retail',orderId:4,referredPhone:'919222222222'})).status,200);
    assert.equal(referral.status,'confirmed');
    assert.equal((await post('/confirm',{orderKind:'retail',orderId:4,referredPhone:'919222222222'})).status,404);
    assert.equal((await post('/redeem',{side:'referrer'})).status,200);
    assert.equal((await post('/redeem',{side:'referrer'})).status,409);
    assert.equal((await post('/redeem',{side:'referred'})).status,200);
  } finally { [User.findByPk,Business.findOne,Referral.findOne,Referral.update,Lead.findOne,RestaurantOrder.findOne]=methods; await new Promise(resolve=>server.close(resolve)); }
});
