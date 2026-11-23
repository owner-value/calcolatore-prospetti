// Base su cui si calcola la commissione PM, secondo la modalità scelta.
// v: { lordoTotale, pulizie, kit, assicurazione, ota } (importi annui)
function computeBasePM(mode, v){
  const deduzioni = {
    'lordo': 0,
    'ota-only': v.ota,
    'pulizie-ota': v.pulizie + v.kit + v.ota,
    'pulizie-assicurazione-ota': v.pulizie + v.kit + v.assicurazione + v.ota
  };
  const d = mode in deduzioni ? deduzioni[mode] : deduzioni['pulizie-assicurazione-ota'];
  return Math.max(v.lordoTotale - d, 0);
}
// La commissione PM si calcola sempre aggiungendo IVA al 22%.
function computePMCommission(base, percentage){
  const netto = base * percentage / 100;
  const iva = netto * 0.22;
  return { netto, iva, totale: netto + iva };
}
if(typeof module !== 'undefined') module.exports = { computeBasePM, computePMCommission };
