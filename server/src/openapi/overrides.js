// Hand-written detail for endpoints where a real schema helps. Keyed "method /full/path". Everything else stays generic.
const obj = (properties, required = []) => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const json = schema => ({ required: true, content: { 'application/json': { schema } } });
export const overrides = {
  'get /api/health': { summary: 'Health check', responses: { 200: { description: 'Service is up', content: { 'application/json': { schema: obj({ status: { type: 'string', example: 'ok' } }) } } } } }
};
