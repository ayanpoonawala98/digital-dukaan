import test from 'node:test';import assert from 'node:assert/strict';
process.env.DATABASE_URL||='postgres://local:local@localhost:5432/test';
const {reportText}=await import('./platform-email-report.js');
test('platform summary distinguishes enquiries from sales and includes counts',()=>{const t=reportText({stores:7,activeStores:6,owners:5,products:44,enquiries:13,requests:2});assert.match(t,/Stores: 7/);assert.match(t,/Active stores: 6/);assert.match(t,/Retail enquiries: 13/);assert.match(t,/not confirmed sales/);assert.match(t,/New shop requests: 2/);});
