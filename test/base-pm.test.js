const test = require('node:test');
const assert = require('node:assert');
const { computeBasePM, computePMCommission } = require('../base-pm.js');

const v = { lordoTotale: 10000, pulizie: 1000, kit: 100, assicurazione: 200, ota: 2000 };

test('lordo: nessuna deduzione', () => assert.strictEqual(computeBasePM('lordo', v), 10000));
test('modalità esistenti invariate', () => {
  assert.strictEqual(computeBasePM('ota-only', v), 8000);
  assert.strictEqual(computeBasePM('pulizie-ota', v), 6900);
  assert.strictEqual(computeBasePM('pulizie-assicurazione-ota', v), 6700);
});
test('mai negativa', () => assert.strictEqual(computeBasePM('ota-only', { ...v, ota: 20000 }), 0));

for(const [mode, expectedBase] of [['lordo', 10000], ['ota-only', 8000], ['pulizie-ota', 6900], ['pulizie-assicurazione-ota', 6700]]){
  test(`commissione 25% più IVA sulla base ${mode}`, () => {
    const base = computeBasePM(mode, v);
    assert.strictEqual(base, expectedBase);
    const pm = computePMCommission(base, 25);
    assert.strictEqual(pm.netto, expectedBase * 0.25);
    assert.ok(Math.abs(pm.iva - expectedBase * 0.25 * 0.22) < 1e-9);
    assert.ok(Math.abs(pm.totale - expectedBase * 0.305) < 1e-9);
  });
}
