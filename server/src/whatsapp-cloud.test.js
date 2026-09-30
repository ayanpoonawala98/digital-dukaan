import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET ||= 'a'.repeat(40);
const { default: app } = await import('./app.js');
const { verifyMetaSignature, sendTestWhatsApp } = await import('./whatsapp-cloud.js');

test('Cloud webhook rejects all requests while disabled', async () => {
  delete process.env.WHATSAPP_CLOUD_ENABLED;
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/integrations/whatsapp/webhook`;
    assert.equal((await fetch(base + '?hub.mode=subscribe&hub.verify_token=abc&hub.challenge=123')).status, 403);
    assert.equal((await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 403);
  } finally { server.close(); }
});
test('Cloud webhook verifies exact challenge and raw-body signature', async () => {
  process.env.WHATSAPP_CLOUD_ENABLED = 'true'; process.env.WHATSAPP_VERIFY_TOKEN = 'verify-test'; process.env.META_APP_SECRET = 'app-secret';
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/integrations/whatsapp/webhook`;
    const ok = await fetch(base + '?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=98765');
    assert.equal(ok.status, 200); assert.equal(await ok.text(), '98765');
    assert.equal((await fetch(base + '?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=98765')).status, 403);
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [] }] });
    const signature = 'sha256=' + createHmac('sha256', 'app-secret').update(body).digest('hex');
    assert.equal(verifyMetaSignature(Buffer.from(body), signature, 'app-secret'), true);
    assert.equal(verifyMetaSignature(Buffer.from(body + ' '), signature, 'app-secret'), false);
    assert.equal((await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature }, body })).status, 200);
    assert.equal((await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256='+'0'.repeat(64) }, body })).status, 403);
  } finally { server.close(); delete process.env.WHATSAPP_CLOUD_ENABLED; }
});
test('Cloud sender is disabled and recipient allowlist prevents other sends', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; throw new Error('must not send'); };
  delete process.env.WHATSAPP_TEST_SEND_ENABLED;
  await assert.rejects(sendTestWhatsApp({ to: '919876543210', text: 'test', fetchImpl }), /disabled/);
  process.env.WHATSAPP_CLOUD_ENABLED = 'true'; process.env.WHATSAPP_TEST_SEND_ENABLED = 'true';
  process.env.WHATSAPP_TEST_PHONE_NUMBER_ID = '1261397693731087'; process.env.WHATSAPP_TEST_RECIPIENT = '918879725802';
  await assert.rejects(sendTestWhatsApp({ to: '919876543210', text: 'test', token: 'dummy', fetchImpl }), /allowlisted/);
  assert.equal(called, false);
  delete process.env.WHATSAPP_CLOUD_ENABLED; delete process.env.WHATSAPP_TEST_SEND_ENABLED;
});

test('staging integration status and simulated check are scoped and cannot send', async () => {
  const {User,Business}=await import('./models/index.js');const jwt=(await import('jsonwebtoken')).default;
  const oldUser=User.findByPk,oldBusiness=Business.findOne;let actor={id:1,role:'owner',active:true};
  User.findByPk=async()=>actor;Business.findOne=async()=>({id:1,ownerId:1});
  const server=app.listen(0),base=`http://127.0.0.1:${server.address().port}/api/owner/1/whatsapp-cloud`;
  const call=(path,body)=>fetch(base+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${jwt.sign({sub:actor.id},process.env.JWT_SECRET)}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  try {
    delete process.env.WHATSAPP_INTEGRATION_UI_ENABLED;assert.equal((await call('/status')).status,404);
    process.env.WHATSAPP_INTEGRATION_UI_ENABLED='true';process.env.WHATSAPP_SANDBOX_OWNER_ID='2';assert.equal((await call('/status')).status,404);
    process.env.WHATSAPP_SANDBOX_OWNER_ID='1';const result=await call('/status');assert.equal(result.status,200);const status=await result.json();assert.equal(status.cloudEnabled,false);assert.ok(!JSON.stringify(status).includes('app-secret'));
    const check=await call('/sandbox-check',{text:'Synthetic sandbox only'});assert.equal(check.status,200);assert.equal((await check.json()).sent,false);assert.equal((await call('/sandbox-check',{text:' '})).status,400);
    actor={id:2,role:'staff',managerId:1,staffBusinessId:1,active:true};assert.equal((await call('/status')).status,403);
  } finally {User.findByPk=oldUser;Business.findOne=oldBusiness;delete process.env.WHATSAPP_INTEGRATION_UI_ENABLED;delete process.env.WHATSAPP_SANDBOX_OWNER_ID;await new Promise(r=>server.close(r));}
});
