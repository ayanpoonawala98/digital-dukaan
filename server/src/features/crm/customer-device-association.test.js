import test from 'node:test';
import assert from 'node:assert/strict';
import { Customer, CustomerDevice } from './crm.js';

// Broadcast and reach-count queries do CustomerDevice.findAll({ include: [{ model: Customer }] }).
// Sequelize throws (HTTP 500) at query build time if the reverse association is missing, even with zero rows.
test('CustomerDevice declares its Customer association for eager loading', () => {
  assert.ok(CustomerDevice.associations.Customer, 'CustomerDevice.belongsTo(Customer) missing');
  assert.equal(CustomerDevice.associations.Customer.target, Customer);
});
