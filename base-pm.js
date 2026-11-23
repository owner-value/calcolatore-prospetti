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
if(typeof module !== 'undefined') module.exports = { computeBasePM };
