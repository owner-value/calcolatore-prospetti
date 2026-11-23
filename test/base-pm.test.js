const test = require('node:test');
const assert = require('node:assert');
const { computeBasePM } = require('../base-pm.js');

const v = { lordoTotale: 10000, pulizie: 1000, kit: 100, assicurazione: 200, ota: 2000 };

test('lordo: nessuna deduzione', () => assert.strictEqual(computeBasePM('lordo', v), 10000));
test('modalità esistenti invariate', () => {
  assert.strictEqual(computeBasePM('ota-only', v), 8000);
  assert.strictEqual(computeBasePM('pulizie-ota', v), 6900);
  assert.strictEqual(computeBasePM('pulizie-assicurazione-ota', v), 6700);
});
test('mai negativa', () => assert.strictEqual(computeBasePM('ota-only', { ...v, ota: 20000 }), 0));
