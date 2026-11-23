// Base su cui si calcola la commissione PM, secondo la modalità scelta.
// v: { lordoTotale, pulizie, kit, assicurazione, ota } (importi annui)
function computeBasePM(mode, v, commissionMode = 'netto'){
  if(commissionMode === 'lordo') return Math.max(v.lordoTotale, 0);
  const deduzioni = {
    'ota-only': v.ota,
    'pulizie-ota': v.pulizie + v.kit + v.ota,
    'pulizie-assicurazione-ota': v.pulizie + v.kit + v.assicurazione + v.ota
  };
  const d = mode in deduzioni ? deduzioni[mode] : deduzioni['pulizie-assicurazione-ota'];
  return Math.max(v.lordoTotale - d, 0);
}
// La percentuale lorda include IVA; quella netta la aggiunge alla commissione.
function computePMCommission(base, percentage, mode = 'netto'){
  const amount = base * percentage / 100;
  const netto = mode === 'lordo' ? amount / 1.22 : amount;
  const totale = mode === 'lordo' ? amount : netto * 1.22;
  return { netto, iva: totale - netto, totale };
}
if(typeof module !== 'undefined') module.exports = { computeBasePM, computePMCommission };
