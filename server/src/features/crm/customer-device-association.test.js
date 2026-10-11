import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';
process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
await import('../../models/index.js');
const { Customer, CustomerDevice } = await import('./crm.js');

// Broadcast and reach-count queries do CustomerDevice.findAll({ include: [{ model: Customer }] }).
// Sequelize throws (HTTP 500) at query build time if the reverse association is missing, even with zero rows.
test('CustomerDevice declares its Customer association for eager loading', () => {
  assert.ok(CustomerDevice.associations.Customer, 'CustomerDevice.belongsTo(Customer) missing');
  assert.equal(CustomerDevice.associations.Customer.target, Customer);
});
