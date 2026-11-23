const test = require('node:test');
const assert = require('node:assert');
const { computeBasePM, computePMCommission } = require('../base-pm.js');

const v = { lordoTotale: 10000, pulizie: 1000, kit: 100, assicurazione: 200, ota: 2000 };

test('modalità esistenti invariate', () => {
  assert.strictEqual(computeBasePM('ota-only', v), 8000);
  assert.strictEqual(computeBasePM('pulizie-ota', v), 6900);
  assert.strictEqual(computeBasePM('pulizie-assicurazione-ota', v), 6700);
});
test('mai negativa', () => assert.strictEqual(computeBasePM('ota-only', { ...v, ota: 20000 }), 0));

for(const mode of ['ota-only', 'pulizie-ota', 'pulizie-assicurazione-ota']){
  test(`Netto applica deduzioni e Lordo usa il totale: ${mode}`, () => {
    const base = computeBasePM(mode, v);
    const net = computePMCommission(base, 25, 'netto');
    const grossBase = computeBasePM(mode, v, 'lordo');
    assert.strictEqual(grossBase, v.lordoTotale);
    const gross = computePMCommission(grossBase, 25, 'lordo');
    assert.ok(Math.abs(net.totale - base * 0.305) < 1e-9);
    assert.strictEqual(gross.totale, 2500);
    assert.ok(Math.abs(gross.netto * 1.22 - gross.totale) < 1e-9);
    assert.strictEqual(gross.netto + gross.iva, gross.totale);
  });
}
test('commissione zero', () => {
  assert.deepStrictEqual(computePMCommission(0, 25, 'lordo'), { netto: 0, iva: 0, totale: 0 });
});
