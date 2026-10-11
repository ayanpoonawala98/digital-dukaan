// Hand-written detail for endpoints where a real schema helps. Keyed "method /full/path". Everything else stays generic.
const obj = (properties, required = []) => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const json = schema => ({ required: true, content: { 'application/json': { schema } } });
export const overrides = {
  'get /api/health': { summary: 'Health check', responses: { 200: { description: 'Service is up', content: { 'application/json': { schema: obj({ status: { type: 'string', example: 'ok' } }) } } } } },
  'patch /api/owner/{storeId}/restaurant-orders/{id}/items': {
    summary: 'Edit items on a New restaurant order (lower or remove only)',
    description: 'Only allowed while the order status is New. Quantities can only go down or lines be removed. Delivery fee never increases; an edit that would put the items subtotal below the saved discount is refused with 409. Send dryRun: true to preview totals without saving.',
    requestBody: json(obj({ lines: { type: 'array', items: obj({ idx: { type: 'integer' }, qty: { type: 'integer', minimum: 0 } }, ['idx', 'qty']) }, dryRun: { type: 'boolean' } }, ['lines'])),
    responses: { 200: { description: 'Updated (or previewed) order totals' }, 409: { description: 'Order is locked, or the edit would drop below the saved discount' } }
  }
};
