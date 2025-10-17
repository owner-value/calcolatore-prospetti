/* ============= Helpers ============= */
const fmtEUR = n => (new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'})).format(+n||0);
const fmtPct = n => `${(+n||0).toFixed(1)}%`;
const $g = id => document.getElementById(id);
const $set = (id,v)=>{ const el=$g(id); if(el) el.textContent = v; };
const num = id => { const el=$g(id); if(!el) return 0; const v=(el.value||'').toString().replace(',','.'); return +v||0; };

/* ============= Campi dinamici costi fissi & dispositivi ============= */
function addFixedCostField(label="Costo fisso extra (€)", value=0){
  const cont=$g('fixedCostsContainer'); if(!cont) return;
  const wrap=document.createElement('label');
  wrap.innerHTML=`<span>${label}</span><input type="number" data-type="fixed-extra" value="${value}" min="0" step="1">`;
  cont.appendChild(wrap);
  wrap.querySelector('input').addEventListener('input', calculateProfit);
  calculateProfit();
}

function addDeviceCostField(label="Dispositivo extra (€)", value=0){
  const cont=$g('deviceCostsContainer'); if(!cont) return;
  const row=document.createElement('div');
  row.className='device-row';
  row.innerHTML = `
    <label><span>${label}</span>
      <input type="number" data-type="device-extra" value="${value}" min="0" step="1">
    </label>
    <div class="device-actions">
      <button type="button" class="btn btn-minor" onclick="removeDeviceRow(this)">Rimuovi</button>
    </div>`;
  cont.appendChild(row);
  row.querySelector('input').addEventListener('input', calculateProfit);
  calculateProfit();
}
function removeDeviceRow(btn){
  const row = btn.closest('.device-row');
  if(row){ row.remove(); calculateProfit(); }
}

/* ============= Core Calculation ============= */
function calculateProfit(){
  // Data ISO default oggi se vuota
  const di=$g('dataISO'); if(di && !di.value){ di.value = new Date().toISOString().slice(0,10); }

  // 1) Ricavi base
  const adr = num('prezzoMedioNotte') || 168;
  const occ = num('occupazioneAnnuale') || 68; // %
  const giorni = Math.round(365 * (occ/100));
  $set('outputGiorniOccupati', giorni);

  // 2) Soggiorni (per calcolare Pulizie/Kit annui)
  const durataMedia = Math.max(1, num('durataMediaSoggiorno') || 1);
  const stays = Math.max(0, Math.ceil(giorni / durataMedia));

  const puliziePerStay = Math.max(0, num('puliziePerSoggiorno'));
  const kitPerStay     = Math.max(0, num('kitPerSoggiorno'));

  const pulizieAnnuo = stays * puliziePerStay;
  const kitAnnuo     = stays * kitPerStay;

  // Preview sezione 2b (solo se presenti)
  $set('previewNumSoggiorni', stays.toString());
  $set('previewPulizieAnnuo', fmtEUR(pulizieAnnuo));
  $set('previewKitAnnuo', fmtEUR(kitAnnuo));

  // 3) Lordi
  const lordoAffitti = adr * giorni;
  const lordoTotale = lordoAffitti + pulizieAnnuo;
  $set('outputLordoTotale', fmtEUR(lordoTotale));

  // 4) Commissioni
  const pOTA = num('percentualeOta') || 20;
  const pPM  = num('percentualePm')  || 30;
  const pCed = num('percentualeCedolare') || 21;

  const otaAffitti = lordoAffitti * (pOTA/100);
  const otaPulizie = pulizieAnnuo * (pOTA/100);
  const costoOTA   = otaAffitti + otaPulizie;

  const basePM = Math.max(lordoAffitti - otaAffitti, 0);
  const costoPM = basePM * (pPM/100);

  // 5) Utenze fisse annuali
  const lucegas = num('speseLuceGas');
  const wifi    = num('speseWifi');
  const amm     = num('speseAmministrazione');
  const acqua   = num('speseAcquaTari');
  const extraFixed = [...document.querySelectorAll('[data-type="fixed-extra"]')]
    .reduce((s,i)=> s + (+i.value||0), 0);
  const utenze = lucegas + wifi + amm + acqua + extraFixed;

  // 6) Sicurezza (breakdown)
  const ringSetup   = Math.max(0, num('costoRingSetup'));
  const ringSubAnn  = Math.max(0, num('abbonamentoMensile')) * 12;
  const extraDev    = [...document.querySelectorAll('[data-type="device-extra"]')]
    .reduce((s,i)=> s + (+i.value||0), 0);

  const ringTotale  = ringSetup + ringSubAnn;
  const dispositivi = ringSetup + ringSubAnn + extraDev;

  // Output sezione 5 (box locale)
  $set('outRingSetup', fmtEUR(ringSetup));
  $set('outRingSubAnnuale', fmtEUR(ringSubAnn));
  $set('outputCostoRingAnnuale', fmtEUR(ringTotale));

  // Output riepilogo sicurezza
  $set('outSumRingSetup', fmtEUR(ringSetup));
  $set('outSumRingSubAnnuale', fmtEUR(ringSubAnn));
  $set('outSumExtraDevices', fmtEUR(extraDev));

  // 7) Base imponibile & imposta cedolare
  const baseImponibile = Math.max(lordoAffitti - otaAffitti - costoPM, 0);
  const imposta = baseImponibile * (pCed/100);

  // 8) Totali e utile
  const costiOperativi = costoOTA + costoPM + pulizieAnnuo + utenze + kitAnnuo + dispositivi;
  const utileAnn = lordoTotale - costiOperativi - imposta;
  const utileMese = utileAnn / 12;

  // 9) Output riepilogo principale
  $set('percOtaOutput', fmtPct(pOTA));             $set('outputCommissioniOta', fmtEUR(costoOTA));
  $set('percPmOutput',  fmtPct(pPM));              $set('outputCostoPm', fmtEUR(costoPM));
  $set('outputPulizieOspite', fmtEUR(pulizieAnnuo));
  $set('outputWelcomeKit', fmtEUR(kitAnnuo));
  $set('outputUtenzeTotali', fmtEUR(utenze));
  $set('outputBaseImponibile', fmtEUR(baseImponibile));
  $set('percCedolareOutput', fmtPct(pCed));        $set('outputImposta', fmtEUR(imposta));
  $set('outputUtileNetto', fmtEUR(utileAnn));      $set('outputUtileMensile', fmtEUR(utileMese));

  // 10) Owner Value (SRL) — stima IRES + IRAP
  const ires = ($g('aliquotaIres') ? num('aliquotaIres') : 24) / 100;
  const irap = ($g('aliquotaIrap') ? num('aliquotaIrap') : 3.9) / 100;
  const ovTasse = costoPM * (ires + irap);
  const ovNetto = costoPM - ovTasse;
  const ovNettoMens = ovNetto / 12;

  $set('outputPmLordo', fmtEUR(costoPM));
  $set('outputPmTasse', fmtEUR(ovTasse));
  $set('outputPmNetto', fmtEUR(ovNetto));
  $set('outputPmNettoMensile', fmtEUR(ovNettoMens));

  // 11) Bridge → Embed 2
  saveToReport({
    dataISO: ($g('dataISO')?.value || new Date().toISOString().slice(0,10)),
    indirizzoRiga1: ($g('indirizzoRiga1')?.value||'').trim(),
    indirizzoRiga2: ($g('indirizzoRiga2')?.value||'').trim(),
    descrizione: '', // (se usi un campo descrizione, leggilo qui)
    puntiDiForza: (($g('puntiForza')?.value||'').trim().split(/\r?\n/)
                    .map(s=>s.replace(/^-+\s*/,'').trim()).filter(Boolean)) || [],
    kpi:{ occupazionePct: occ, adr: adr, fatturatoLordoNettoPulizie: lordoTotale },
    spese:{
      pulizie: pulizieAnnuo,
      utenzeAmm: utenze,
      ota: costoOTA,
      kit: kitAnnuo,
      pm: costoPM,
      unaTantum: dispositivi
    },
    risultati:{ utileLordo: lordoTotale - (costoOTA + pulizieAnnuo + utenze + kitAnnuo + dispositivi),
                utileNetto: utileAnn,
                mensileNetto: utileMese }
  });
}

/* ============= Bridge storage ============= */
function saveToReport(model){
  try{
    localStorage.setItem('ownervalue:model', JSON.stringify(model));
    // aggiorna immediatamente il report aperto nella stessa tab
    window.dispatchEvent(new Event('storage'));
  }catch(e){ console.error('Storage error', e); }
}

/* ============= Init ============= */
document.addEventListener('DOMContentLoaded', () => {
  // attach inputs that might be dynamically added
  document.querySelectorAll('input, textarea, select').forEach(el=>{
    el.addEventListener('input', calculateProfit);
    el.addEventListener('change', calculateProfit);
  });
  calculateProfit();
});
