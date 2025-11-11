// Bootstrap API override from query/hash/localStorage for local dev convenience.
(function(){
  if(typeof window === 'undefined') return;
  const STORAGE_KEY = 'calcolatore:api-base';
  const sanitize = value => {
    if(!value) return '';
    const raw = value.toString().trim();
    if(!raw) return '';
    try{
      const parsed = new URL(raw);
      if(parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    }catch(err){
      return '';
    }
    return raw.replace(/\/$/, '');
  };
  const apply = value => {
    const clean = sanitize(value);
    if(!clean) return false;
    window.CALCOLATORE_API = clean;
    try{ localStorage.setItem(STORAGE_KEY, clean); }catch(err){}
    return true;
  };
  if(apply(window.CALCOLATORE_API)) return;
  try{
    const currentUrl = new URL(window.location.href);
    const q = currentUrl.searchParams.get('api');
    if(q && apply(q)) return;
  }catch(err){}
  const hash = window.location.hash || '';
  const match = hash.match(/[?&#]api=([^&]+)/);
  if(match && apply(decodeURIComponent(match[1]))) return;
  try{
    const stored = localStorage.getItem(STORAGE_KEY);
    if(stored) apply(stored);
  }catch(err){}
})();

/* ============= Helpers ============= */
const DEFAULT_TITLE = document.title || 'Calcolatore Prospetti · Owner Value';
const fmtEUR = n => (new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'})).format(+n||0);
const fmtPct = n => {
  const value = Number.isFinite(+n) ? +n : 0;
  const formatted = value.toFixed(1);
  return `${formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted}%`;
};
const $g = id => document.getElementById(id);
const $set = (id,v)=>{ const el=$g(id); if(el) el.textContent = v; };
const num = id => { const el=$g(id); if(!el) return 0; const v=(el.value||'').toString().replace(',','.'); return +v||0; };

const DEFAULT_PROD_API = 'https://calcolatore-prospetti.onrender.com';
const LOCAL_API = 'http://localhost:3001';

const API_BASE_URL = (
  window.CALCOLATORE_API ||
  (['https://calcolatore-prospetti.onrender.com'].includes(location.hostname) || location.protocol === 'file:' ? LOCAL_API : DEFAULT_PROD_API)
).replace(/\/$/, '');

const PROSPECTS_ENDPOINT = `${API_BASE_URL}/api/prospetti`;
const PROPERTIES_ENDPOINT = `${API_BASE_URL}/api/properties`;
const ENCODED_API_BASE = encodeURIComponent(API_BASE_URL);
const appendApiToHref = (url = '') => {
  const href = `${url || ''}`;
  if(!API_BASE_URL) return href;
  const [base, hash = ''] = href.split('#');
  const parts = hash ? hash.split('&').filter(Boolean) : [];
  if(parts.some(part => part.startsWith('api='))) return href;
  parts.push(`api=${ENCODED_API_BASE}`);
  return `${base}#${parts.join('&')}`;
};
const applyApiToLinks = (root = document) => {
  if(!root || typeof root.querySelectorAll !== 'function') return;
  root.querySelectorAll('[data-append-api-link]').forEach(anchor => {
    const href = anchor.getAttribute('href') || '';
    anchor.setAttribute('href', appendApiToHref(href));
  });
};
const slugify = (str = '') => str
  .toString()
  .trim()
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\w\s-]/g, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

let latestModel = null;
let propertiesCache = [];
let baseDocumentTitle = document.title || DEFAULT_TITLE;
let printTitleRestore = null;

async function loadProperties(force=false){
  if(!force && propertiesCache.length) return propertiesCache;
  const res = await fetch(PROPERTIES_ENDPOINT);
  if(!res.ok) throw new Error(`Status ${res.status}`);
  propertiesCache = await res.json();
  return propertiesCache;
}

function findProperty(slug){
  if(!slug) return null;
  return propertiesCache.find(item => item.slug === slug) || null;
}

function populatePropertySelect(selectEl, selectedSlug=''){
  if(!selectEl) return;
  const current = selectedSlug || selectEl.value || '';
  const dropdown = getDropdown(selectEl.id);
  const optionList = [{ label: 'Nessuna proprieta', value: '' }];
  propertiesCache.forEach(item => {
    const label = item.nome || item.slug;
    optionList.push({ label, value: item.slug });
  });
  if(current && !optionList.some(opt => opt.value === current)){
    optionList.push({ label: current, value: current });
  }

  if(dropdown){
    dropdown.setOptions(optionList, current);
  }

  if(selectEl.tagName === 'SELECT'){
    selectEl.innerHTML = optionList.map(opt => {
      const sel = opt.value === current ? ' selected' : '';
      return `<option value="${opt.value}"${sel}>${opt.label}</option>`;
    }).join('');
  }else{
    selectEl.value = current;
  }
}

/* ============= Dropdown helpers ============= */
const dropdownRegistry = new Map();

function registerDropdownKey(key, api){
  if(!key || !api) return;
  dropdownRegistry.set(key, api);
}

function getDropdown(key){
  if(!key) return null;
  return dropdownRegistry.get(key) || null;
}

function initDropdown(root, options = {}){
  if(!root) return null;
  const key = options.id || root.dataset.dropdown || '';
  if(key && dropdownRegistry.has(key)) return dropdownRegistry.get(key);

  const toggle = root.querySelector('[data-dropdown-toggle]');
  const menu = root.querySelector('[data-dropdown-menu]');
  const hidden = root.querySelector('input[type="hidden"]');
  const placeholder = options.placeholder || root.dataset.placeholder || toggle?.textContent || '';
  const changeHandlers = [];
  const state = { options: [], value: hidden?.value || '', placeholder };

  const close = () => {
    root.classList.remove('is-open');
    if(toggle) toggle.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    root.classList.add('is-open');
    if(toggle) toggle.setAttribute('aria-expanded', 'true');
  };
  const toggleOpen = () => {
    if(root.classList.contains('is-open')){
      close();
    }else{
      open();
    }
  };

  toggle?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    toggleOpen();
  });

  menu?.addEventListener('click', e => {
    const btn = e.target.closest('[data-dropdown-option]');
    if(!btn) return;
    const value = btn.dataset.value || '';
    setValue(value, { trigger: true });
    close();
  });

  document.addEventListener('click', e => {
    if(!root.contains(e.target)){
      close();
    }
  });

  const renderOptions = selectedValue => {
    if(!menu) return;
    menu.innerHTML = '';
    if(!state.options.length){
      const emptyBtn=document.createElement('button');
      emptyBtn.type='button';
      emptyBtn.className='dropdown-item is-active';
      emptyBtn.dataset.value='';
      emptyBtn.setAttribute('data-dropdown-option','');
      emptyBtn.setAttribute('role','option');
      emptyBtn.setAttribute('aria-selected','true');
      emptyBtn.textContent = state.placeholder;
      menu.appendChild(emptyBtn);
      return;
    }
    state.options.forEach(opt => {
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='dropdown-item';
      btn.dataset.value = opt.value ?? '';
      btn.setAttribute('data-dropdown-option','');
      btn.setAttribute('role','option');
      btn.textContent = opt.label ?? '';
      const isActive = (opt.value ?? '') === (selectedValue ?? '');
      if(isActive){
        btn.classList.add('is-active');
      }
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      menu.appendChild(btn);
    });
  };

  const syncActiveState = selectedValue => {
    if(!menu) return;
    menu.querySelectorAll('[data-dropdown-option]').forEach(btn => {
      const isActive = (btn.dataset.value || '') === (selectedValue ?? '');
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  };

  const setOptions = (list = [], selectedValue = undefined) => {
    state.options = Array.isArray(list) ? list.slice() : [];
    const valueToSet = selectedValue !== undefined ? selectedValue : state.value;
    renderOptions(valueToSet);
    setValue(valueToSet, { trigger: false, skipRender: true });
  };

  const setValue = (value = '', { trigger = false, skipRender = false } = {}) => {
    state.value = value ?? '';
    if(hidden) hidden.value = state.value;
    const selected = state.options.find(opt => (opt.value ?? '') === state.value) || null;
    if(toggle){
      toggle.textContent = selected ? selected.label : state.placeholder;
      toggle.dataset.selected = selected ? 'true' : 'false';
    }
    if(!skipRender){
      renderOptions(state.value);
    }else{
      syncActiveState(state.value);
    }
    if(trigger){
      changeHandlers.forEach(fn => {
        try{ fn(state.value, selected); }catch(err){ console.error('dropdown change handler', err); }
      });
    }
  };

  const getValue = () => state.value;
  const onChange = fn => {
    if(typeof fn === 'function') changeHandlers.push(fn);
  };

  const api = { setOptions, setValue, getValue, onChange, close, open, placeholder };

  if(key) registerDropdownKey(key, api);
  if(hidden?.id) registerDropdownKey(hidden.id, api);

  // default state
  renderOptions(state.value);
  setValue(state.value, { trigger: false, skipRender: true });

  return api;
}

/* ============= Campi dinamici costi fissi & dispositivi ============= */
function addFixedCostField(label="Costo fisso extra mensile (€)", value=0, options={}){
  const cont=$g('fixedCostsContainer'); if(!cont) return;
  const opts = (options && typeof options === 'object') ? options : {};
  const wrap=document.createElement('label');
  wrap.innerHTML=`<span>${label}</span><input type="number" data-type="fixed-extra" value="${value}" min="0" step="1">`;
  cont.appendChild(wrap);
  wrap.querySelector('input').addEventListener('input', calculateProfit);
  if(!opts.skipCalc) calculateProfit();
}

function addDeviceCostField(name='', amount=0, options={}){
  const cont=$g('deviceCostsContainer'); if(!cont) return;
  const opts = (options && typeof options === 'object') ? options : {};
  const row=document.createElement('div');
  row.className='device-row';
  const labelName=document.createElement('label');
  labelName.innerHTML='<span>Descrizione</span>';
  const inputName=document.createElement('input');
  inputName.type='text';
  inputName.dataset.type='device-name';
  inputName.placeholder='Spesa Extra';
  inputName.value=name;
  labelName.appendChild(inputName);

  const labelAmount=document.createElement('label');
  labelAmount.innerHTML='<span>Importo (€)</span>';
  const inputAmount=document.createElement('input');
  inputAmount.type='number';
  inputAmount.dataset.type='device-extra';
  inputAmount.min='0';
  inputAmount.step='1';
  inputAmount.value=amount;
  labelAmount.appendChild(inputAmount);

  const actions=document.createElement('div');
  actions.className='device-actions';
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='btn btn-minor';
  btn.textContent='Rimuovi';
  btn.addEventListener('click', function(){ removeDeviceRow(this); });
  actions.appendChild(btn);

  row.append(labelName,labelAmount,actions);
  cont.appendChild(row);
  inputName.addEventListener('input', calculateProfit);
  inputAmount.addEventListener('input', calculateProfit);
  if(!opts.skipCalc) calculateProfit();
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
  const indirizzo1 = ($g('indirizzoRiga1')?.value || '').trim();
  // Respect a runtime flag that suppresses changing document.title (used when
  // preparing the page for printing). Browsers include the page title and
  // timestamp in native print headers/footers, so we avoid setting the title
  // while printing to keep PDFs clean.
  if(!window.__ov_noTitle){
    document.title = indirizzo1 ? `Prospetto: ${indirizzo1}` : DEFAULT_TITLE;
  }
  baseDocumentTitle = document.title;

  const adr = num('prezzoMedioNotte') || 168;
  const occ = num('occupazioneAnnuale') || 68; // %
  const giorni = Math.round(365 * (occ/100));
  $set('outputGiorniOccupati', giorni);

  // 2) Soggiorni (per calcolare Pulizie/Kit annui)
  const durataMedia = Math.max(1, num('durataMediaSoggiorno') || 1);
  const stays = Math.max(0, Math.ceil(giorni / durataMedia));

  const puliziePerStay = Math.max(0, num('puliziePerSoggiorno'));
  const kitPerStay     = Math.max(0, num('kitPerSoggiorno'));

  const autoCheckbox = $g('autoCalcPerSoggiorno');
  const autoCalc = autoCheckbox ? autoCheckbox.checked : true;

  const autoFields = $g('autoFields');
  const manualFields = $g('manualFields');
  if(autoFields){
    if(autoCalc){
      autoFields.style.removeProperty('display');
    }else{
      autoFields.style.display = 'none';
    }
  }
  if(manualFields){
    manualFields.style.display = autoCalc ? 'none' : 'grid';
  }

  let pulizieAnnuo;
  let kitAnnuo;

  if(autoCalc){
    pulizieAnnuo = stays * puliziePerStay;
    kitAnnuo     = stays * kitPerStay;
  }else{
    pulizieAnnuo = Math.max(0, num('totalePulizieOspite'));
    kitAnnuo     = Math.max(0, num('costoWelcomeKit'));
  }

  // Preview sezione 2b (solo se presenti)
  if(autoCalc){
    $set('previewNumSoggiorni', stays.toString());
    $set('previewPulizieAnnuo', fmtEUR(pulizieAnnuo));
    $set('previewKitAnnuo', fmtEUR(kitAnnuo));
  }else{
    $set('previewNumSoggiorni', '—');
    $set('previewPulizieAnnuo', '—');
    $set('previewKitAnnuo', '—');
  }

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

  const basePM = Math.max(lordoTotale - costoOTA, 0);
  const costoPM = basePM * (pPM/100);

  // 5) Utenze fisse annuali
  const mesiField = $g('utenzeMesi');
  let mesiUtenze = 12;
  if(mesiField){
    if(mesiField.value === '') mesiField.value = '12';
    const parsed = Number(mesiField.value);
    mesiUtenze = Number.isFinite(parsed) ? Math.max(0, parsed) : 12;
  }
  const lucegasMens = Math.max(0, num('speseLuceGas'));
  const wifiMens    = Math.max(0, num('speseWifi'));
  const ammMens     = Math.max(0, num('speseAmministrazione'));
  const acquaMens   = Math.max(0, num('speseAcquaTari'));
  const extraFixedMens = [...document.querySelectorAll('[data-type="fixed-extra"]')]
    .reduce((s,i)=> s + Math.max(0, (+i.value||0)), 0);
  const utenzeMensili = lucegasMens + wifiMens + ammMens + acquaMens + extraFixedMens;
  const utenze = utenzeMensili * mesiUtenze;

  // 6) Sicurezza (breakdown)
  const ringSetup   = Math.max(0, num('costoRingSetup'));
  const ringSubAnn  = Math.max(0, num('abbonamentoMensile')) * 12;
  const extraDevices = [...document.querySelectorAll('.device-row')].map(row=>{
    const nameInput = row.querySelector('[data-type="device-name"]');
    const amountInput = row.querySelector('[data-type="device-extra"]');
    const amount = Math.max(0, +(amountInput?.value || 0));
    const rawLabel = (nameInput?.value || '').trim();
    const label = rawLabel || 'Spesa extra';
    return { label, amount };
  }).filter(item => item.amount > 0);

  const unaTantumManuali = Math.max(0, num('speseUnaTantumManuali'));
  const extraDev = unaTantumManuali + extraDevices.reduce((sum, item) => sum + item.amount, 0);

  const ringTotale  = ringSetup + ringSubAnn;
  const sicurezzaTotale = ringTotale + extraDev;

  // Output sezione 5 (box locale)
  $set('outRingSetup', fmtEUR(ringSetup));
  $set('outRingSubAnnuale', fmtEUR(ringSubAnn));
  $set('outputCostoRingAnnuale', fmtEUR(ringTotale));

  // Output riepilogo sicurezza
  $set('outSumRingSetup', fmtEUR(ringSetup));
  $set('outSumRingSubAnnuale', fmtEUR(ringSubAnn));
  const extraList = $g('securityExtraList');
  if(extraList){
    extraList.innerHTML = '';
    if(unaTantumManuali > 0){
      const row=document.createElement('div');
      row.className='row';
      const span=document.createElement('span');
      span.textContent='Kit Sicurezza';
      const strong=document.createElement('strong');
      strong.className='bad';
      strong.textContent=fmtEUR(unaTantumManuali);
      row.append(span,strong);
      extraList.appendChild(row);
    }
    if(extraDevices.length){
      extraDevices.forEach(({label, amount})=>{
        const row=document.createElement('div');
        row.className='row';
        const span=document.createElement('span');
        span.textContent=label;
        const strong=document.createElement('strong');
        strong.className='bad';
        strong.textContent=fmtEUR(amount);
        row.append(span,strong);
        extraList.appendChild(row);
      });
    }
  }

  // 7) Base imponibile & imposta cedolare
  const baseImponibile = Math.max(lordoAffitti - otaAffitti - costoPM, 0);
  const imposta = baseImponibile * (pCed/100);

  // 8) Totali e utile
  const costiOperativi = costoOTA + costoPM + pulizieAnnuo + utenze + kitAnnuo + sicurezzaTotale;
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
  $set('p6-cedolare-percent', fmtPct(pCed));       $set('p6-cedolare', fmtEUR(imposta));
  $set('p6-ota-percent', fmtPct(pOTA));
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
  const reportModel = {
    dataISO: ($g('dataISO')?.value || new Date().toISOString().slice(0,10)),
    indirizzoRiga1: ($g('indirizzoRiga1')?.value||'').trim(),
    indirizzoRiga2: ($g('indirizzoRiga2')?.value||'').trim(),
    descrizione: '', // (se usi un campo descrizione, leggilo qui)
    percentualePm: pPM,
    puntiDiForza: (($g('puntiForza')?.value||'').trim().split(/\r?\n/)
                    .map(s=>s.replace(/^-+\s*/,'').trim()).filter(Boolean)) || [],
    kpi:{ occupazionePct: occ, adr: adr, fatturatoLordoNettoPulizie: lordoTotale },
    spese:{
      pulizie: pulizieAnnuo,
      utenzeAmm: utenze,
      utenzeMensili,
      utenzeMesi: mesiUtenze,
      includeAmministrazione: ammMens > 0,
      utenzeDettaglio: {
        luceGasMensile: lucegasMens,
        wifiMensile: wifiMens,
        amministrazioneMensile: ammMens,
        amministrazioneAnnua: ammMens * mesiUtenze,
        acquaMensile: acquaMens,
        extraMensili: extraFixedMens,
        totaleMensile: utenzeMensili
      },
      ota: costoOTA,
      kit: kitAnnuo,
      pm: costoPM,
      pmPct: pPM,
      unaTantum: sicurezzaTotale,
      sicurezza:{
        ringSetup,
        ringSubAnn,
        extraManuale: unaTantumManuali,
        extraDettagli: extraDevices,
        totale: sicurezzaTotale
      }
    },
    risultati:{ utileLordo: lordoTotale - (costoOTA + pulizieAnnuo + utenze + kitAnnuo + sicurezzaTotale),
                utileNetto: utileAnn,
                mensileNetto: utileMese }
  };

  saveToReport(reportModel);
}

function formatItalianDate(iso){
  const source = iso ? new Date(iso) : new Date();
  if(Number.isNaN(source.getTime())) return '';
  return source.toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'});
}

function syncReportDates(iso){
  const formatted = formatItalianDate(iso);
  if(!formatted) return;
  ['p1-data','p2-data','p3-data','p4-data','p5-data','p6-data','p7-data'].forEach(id=>{
    const el = $g(id);
    if(el) el.textContent = formatted;
  });
}

function prepareReportForPrint(force=false){
  const input = $g('dataISO');
  let shouldRecalc = !!force;
  if(input){
    const today = new Date().toISOString().slice(0,10);
    if(force || !input.value){
      if(input.value !== today){
        input.value = today;
        shouldRecalc = true;
      }
    }
  }
  const isoValue = input?.value || new Date().toISOString().slice(0,10);
  syncReportDates(isoValue);
  if(shouldRecalc){
    // Temporarily suppress document.title updates while recalculating so the
    // browser doesn't pick up a dynamic title for its native print header.
    const prevTitle = document.title;
    try{
      window.__ov_noTitle = true;
      calculateProfit();
    }finally{
      window.__ov_noTitle = false;
      // restore the previous title immediately
      document.title = prevTitle;
      baseDocumentTitle = prevTitle || DEFAULT_TITLE;
    }
  }
  // Note: native browser headers/footers (page numbers, date/time, title) are
  // controlled by the browser and cannot be removed programmatically. Ask users
  // to disable headers/footers in the print dialog for a clean PDF.
}

function printWithDate(options = {}){
  const { forceAsync = false } = options;
  prepareReportForPrint(true);
  const triggerPrint = () => {
    try{
      window.print();
    }catch(err){
      console.warn('window.print() failed', err);
    }
  };

  const userActivation = (() => {
    try{
      const ua = navigator && navigator.userActivation;
      return !!(ua && ua.isActive);
    }catch(err){
      return false;
    }
  })();

  if(!forceAsync && userActivation){
    triggerPrint();
    return;
  }

  requestAnimationFrame(() => setTimeout(triggerPrint, 20));
}

window.printWithDate = printWithDate;
// Ensure we suppress title updates and hide transient UI when printing.
window.addEventListener('beforeprint', () => {
  try{ window.__ov_noTitle = true; }catch(e){}
  // ensure we prepare the report (dates, recalc) before print
  prepareReportForPrint(false);

  // blank the document title so browser native header doesn't include address
  // Do not blank the document title here — keep the title so the browser
  // can propose a human-friendly filename when saving as PDF.

  // aggressively hide known transient/status elements and any element
  // that contains the exact status text we show when applying data.
  try{
    const toHide = [];
    const selectors = ['#ov-toast','#prospectManager','.prospect-status','#prospectStatus','#prospectStatusBottom','[data-role="prospect-status"]'];
    selectors.forEach(s => {
      document.querySelectorAll(s).forEach(el => { toHide.push(el); });
    });
    // hide any element whose text contains the status message
    const statusText = 'Dati applicati al calcolatore';
    document.querySelectorAll('body *').forEach(el => {
      if(el.children && el.children.length) return; // prefer leaf nodes
      const txt = (el.textContent || '').trim();
      if(txt === statusText) toHide.push(el);
    });
    // dedupe and store previous display values for restoration
    window.__ov_print_hidden = [];
    toHide.forEach(el => {
      if(!el || !el.style) return;
      if(window.__ov_print_hidden.some(h => h.el === el)) return;
      window.__ov_print_hidden.push({ el, display: el.style.display || '' });
      el.style.display = 'none';
    });
  }catch(e){ console.warn('beforeprint hiding failed', e); }
});

window.addEventListener('afterprint', () => {
  try{ window.__ov_noTitle = false; }catch(e){}
  try{ document.title = window.__ov_prev_title || baseDocumentTitle || DEFAULT_TITLE; }catch(e){}
  try{
    if(Array.isArray(window.__ov_print_hidden)){
      window.__ov_print_hidden.forEach(item => {
        try{ item.el.style.display = item.display || ''; }catch(e){}
      });
    }
    window.__ov_print_hidden = null;
  }catch(e){ console.warn('afterprint restore failed', e); }
  printTitleRestore = null;
});

/* ============= Bridge storage ============= */
function saveToReport(model){
  if(model) latestModel = model;
  if(!latestModel) return;
  try{
    localStorage.setItem('ownervalue:model', JSON.stringify(latestModel));
    // aggiorna immediatamente il report aperto nella stessa tab
    window.dispatchEvent(new Event('storage'));
  }catch(e){ console.error('Storage error', e); }
}

function gatherFormValues(){
  const root = document.getElementById('calculatorRoot');
  const result = { fields: {}, fixedExtras: [], deviceCosts: [] };
  if(!root) return result;

  root.querySelectorAll('input, textarea, select').forEach(el => {
    if(el.closest('[data-persist-ignore]')) return;
    if(el.matches('[data-type="fixed-extra"]')){
      const label = el.closest('label')?.querySelector('span')?.textContent || 'Costo fisso extra mensile (€)';
      result.fixedExtras.push({ label, value: el.value });
      return;
    }
    if(el.dataset.type === 'device-name' || el.dataset.type === 'device-extra'){
      return;
    }
    if(!el.id) return;
    if(el.type === 'checkbox'){
      result.fields[el.id] = !!el.checked;
    }else if(el.type !== 'file'){
      result.fields[el.id] = el.value;
    }
  });

  root.querySelectorAll('#deviceCostsContainer .device-row').forEach(row => {
    const nameEl = row.querySelector('[data-type="device-name"]');
    const amountEl = row.querySelector('[data-type="device-extra"]');
    if(!nameEl && !amountEl) return;
    result.deviceCosts.push({
      name: nameEl ? nameEl.value : '',
      amount: amountEl ? amountEl.value : ''
    });
  });

  const propSelect = document.getElementById('prospectProperty');
  result.propertySlug = propSelect ? (propSelect.value || '') : '';

  return result;
}

function resetFixedExtras(){
  const cont = document.getElementById('fixedCostsContainer');
  if(!cont) return;
  cont.querySelectorAll('[data-type="fixed-extra"]').forEach(input => {
    const label = input.closest('label');
    if(label) label.remove();
  });
}

function setDeviceRows(items){
  const cont = document.getElementById('deviceCostsContainer');
  if(!cont) return;
  cont.querySelectorAll('.device-row').forEach(row => row.remove());

  if(!Array.isArray(items) || !items.length){
    addDeviceCostField('', 0, { skipCalc: true });
    return;
  }

  items.forEach(item => {
    const name = item && typeof item.name === 'string' ? item.name : '';
    const amountRaw = item && Object.prototype.hasOwnProperty.call(item, 'amount') ? item.amount : '';
    addDeviceCostField(name, amountRaw, { skipCalc: true });
  });
}

function restoreFormValues(state){
  if(!state || typeof state !== 'object') return;
  const { fields = {}, fixedExtras = [], deviceCosts = [] } = state;

  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if(!el || el.closest('[data-persist-ignore]')) return;
    if(el.type === 'checkbox'){
      el.checked = !!value;
    }else if(el.type !== 'file'){
      el.value = value;
    }
  });

  resetFixedExtras();
  fixedExtras.forEach(extra => {
    if(!extra) return;
    addFixedCostField(extra.label || 'Costo fisso extra mensile (€)', extra.value ?? 0, { skipCalc: true });
  });

  setDeviceRows(deviceCosts);
  calculateProfit();
}

const prospectManager = (() => {
  let elements = {};
  let currentProspect = null;
  let knownProspects = [];
  let config = { initialSlug: '', initialProperty: '', autoApply: false, autoPrint: false };

  const ensureUniqueSlugValue = (candidate, currentSlug = '') => {
    const normalized = slugify(candidate || '');
    if(!normalized) return '';
    const used = new Set(Array.isArray(knownProspects) ? knownProspects.map(item => item.slug) : []);
    if(currentSlug) used.delete(currentSlug);
    if(!used.has(normalized)) return normalized;

    const match = normalized.match(/^(.*?)(?:-(\d+))?$/);
    const root = match && match[1] ? match[1] : normalized;
    let counter = match && match[2] ? (parseInt(match[2], 10) || 1) + 1 : 2;
    let candidateSlug = `${root}-${counter}`;
    while(used.has(candidateSlug)){
      counter += 1;
      candidateSlug = `${root}-${counter}`;
    }
    return candidateSlug;
  };

  const setStatus = (message = '', type = 'info', options = {}) => {
    if(options.silent) return;
    const nodes = (elements.statusEls && elements.statusEls.length)
      ? elements.statusEls
      : (elements.status ? [elements.status] : []);
    if(!nodes.length) return;
    nodes.forEach(el => {
      el.textContent = message;
      el.className = 'prospect-status';
      if(message){
        el.classList.add(type);
      }
    });
  };

  // Small UI toast helper for visible notifications
  const showToast = (message, ms = 3000) => {
    try{
      let toast = document.getElementById('ov-toast');
      if(!toast){
        toast = document.createElement('div');
        toast.id = 'ov-toast';
        toast.style.position = 'fixed';
        toast.style.right = '16px';
        toast.style.bottom = '16px';
        toast.style.padding = '10px 14px';
        toast.style.background = 'rgba(16,185,129,0.95)';
        toast.style.color = '#fff';
        toast.style.borderRadius = '6px';
        toast.style.boxShadow = '0 4px 16px rgba(2,6,23,0.2)';
        toast.style.zIndex = 99999;
        toast.style.fontWeight = '700';
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.style.opacity = '1';
      if(toast._timeout) clearTimeout(toast._timeout);
      toast._timeout = setTimeout(()=>{
        toast.style.transition = 'opacity 300ms ease';
        toast.style.opacity = '0';
      }, ms);
    }catch(e){ console.warn('showToast failed', e); }
  };

  const getSelectedProperty = () => {
    const dropdownValue = elements.propertyDropdown?.getValue?.() || '';
    const fallback = elements.property?.value || '';
    return (dropdownValue || fallback || '').trim();
  };

  const updatePropertyActionState = () => {
    const hasSelection = !!getSelectedProperty();
    if(elements.propertyOpenBtn){
      elements.propertyOpenBtn.disabled = !hasSelection;
      elements.propertyOpenBtn.setAttribute('aria-disabled', hasSelection ? 'false' : 'true');
    }
  };

  const getSelectedProspect = () => {
    const dropdownValue = elements.selectDropdown?.getValue?.() || '';
    const fallback = elements.select?.value || '';
    return (dropdownValue || fallback || '').trim();
  };

  const fillProspectFields = prospect => {
    if(!prospect) return;
    if(elements.slug) elements.slug.value = prospect.slug || '';
    if(elements.title) elements.title.value = prospect.titolo || prospect.indirizzo1 || '';
    if(elements.property){
      const propSlug = prospect.property?.slug || prospect.datiJson?.propertySlug || '';
      populatePropertySelect(elements.property, propSlug);
      if(!elements.propertyDropdown){
        elements.property.value = propSlug || '';
      }
      updatePropertyActionState();
    }
  };

  const resetForm = (options = {}) => {
    currentProspect = null;
    if(elements.selectDropdown){
      elements.selectDropdown.setValue('');
    }else if(elements.select){
      elements.select.value = '';
    }
    if(elements.slug) elements.slug.value = '';
    if(elements.title) elements.title.value = '';
    setStatus('Modulo pronto per un nuovo prospetto', 'info', options);
  };

  const refreshList = async (selectedSlug = '', options = {}) => {
    if(!elements.select && !elements.selectDropdown) return [];
    const silent = !!options.silent;
    try{
      const propertySlug = getSelectedProperty();
      if(!silent) setStatus('Caricamento elenco prospetti...', 'info');
      const url = propertySlug ? `${PROSPECTS_ENDPOINT}?property=${encodeURIComponent(propertySlug)}` : PROSPECTS_ENDPOINT;
  const res = await fetch(url);
      if(!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
  knownProspects = Array.isArray(data) ? data.slice() : [];
      const dropdownOptions = [{ label: '— Seleziona —', value: '' }];
      data.forEach(item => {
        const labelParts = [item.titolo || item.indirizzo1 || item.slug];
        if(item.property && (item.property.nome || item.property.slug)){
          labelParts.push(`(${item.property.nome || item.property.slug})`);
        }
        dropdownOptions.push({ label: labelParts.join(' '), value: item.slug });
      });

      if(elements.selectDropdown){
        elements.selectDropdown.setOptions(dropdownOptions, selectedSlug);
      }

      if(elements.select && elements.select.tagName === 'SELECT'){
        elements.select.innerHTML = '';
        dropdownOptions.forEach(opt => {
          const optionEl = document.createElement('option');
          optionEl.value = opt.value;
          optionEl.textContent = opt.label;
          if(opt.value === selectedSlug) optionEl.selected = true;
          elements.select.appendChild(optionEl);
        });
      }else if(elements.select && !elements.selectDropdown){
        elements.select.value = selectedSlug || '';
      }

      if(!silent){
        const suffix = propertySlug ? ` per "${propertySlug}"` : '';
        setStatus(data.length ? `Trovati ${data.length} prospetti salvati${suffix}` : `Nessun prospetto salvato${suffix}`, 'info');
      }
      if(selectedSlug){
        const stillExists = data.some(item => item.slug === selectedSlug);
        if(stillExists){
          await loadProspect(selectedSlug, { silent: true });
        }else{
          currentProspect = null;
        }
      }else{
        currentProspect = null;
      }
      return data;
    }catch(err){
      console.error(err);
      setStatus('Errore nel caricare l\'elenco dei prospetti', 'error');
      return [];
    }
  };

  const loadProspect = async (slug, options = {}) => {
    if(!slug) return null;
    const silent = !!options.silent;
    try{
      if(!silent) setStatus('Caricamento prospetto...', 'info');
      const res = await fetch(`${PROSPECTS_ENDPOINT}/${encodeURIComponent(slug)}`);
      if(!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      currentProspect = data;
      if(options.setSelect){
        if(elements.selectDropdown){
          elements.selectDropdown.setValue(slug || '', { trigger: false });
        }else if(elements.select){
          elements.select.value = slug;
        }
      }
      fillProspectFields(data);
      if(!silent){
        setStatus('Prospetto caricato. Usa "Applica dati" per ripristinare i valori.', 'success');
      }
      return data;
    }catch(err){
      console.error(err);
      if(options.clearOnError) resetForm({ silent: true });
      setStatus('Errore nel caricare il prospetto selezionato', 'error');
      return null;
    }
  };

  const ensureModel = () => {
    if(!latestModel){
      calculateProfit();
    }
    return latestModel;
  };

  const saveCurrentProspect = async () => {
    const providedSlug = elements.slug?.value?.trim();
    const model = ensureModel();
    const fallbackSource = elements.title?.value?.trim() || model?.indirizzoRiga1 || '';
    let slug = slugify(providedSlug || fallbackSource);
    if(!slug){
      setStatus('Inserisci un indirizzo o un titolo per generare lo slug', 'error');
      return;
    }
    const resolvedSlug = ensureUniqueSlugValue(slug, currentProspect?.slug || '');
    let slugAdjustedMessage = '';
    if(resolvedSlug && resolvedSlug !== slug){
      slug = resolvedSlug;
      slugAdjustedMessage = `Slug già utilizzato. Impostato automaticamente su "${slug}".`;
    }
    const propertySlug = getSelectedProperty();
    const propertyInfo = findProperty(propertySlug);
    const propertySlugs = new Set();
    if(Array.isArray(propertiesCache)){
      propertiesCache.forEach(prop => {
        if(prop && prop.slug){
          propertySlugs.add(prop.slug);
        }
      });
    }
    if(propertySlug){
      propertySlugs.add(propertySlug);
    }

    if(propertySlugs.has(slug)){
      if(currentProspect && currentProspect.slug === slug){
        setStatus('Lo slug del prospetto coincide con quello di una proprietà esistente. Modificalo prima di salvare.', 'error');
        return;
      }

      const used = new Set(propertySlugs);
      if(Array.isArray(knownProspects)){
        knownProspects.forEach(item => {
          if(item && item.slug){
            used.add(item.slug);
          }
        });
      }

      const match = slug.match(/^(.*?)(?:-(\d+))?$/);
      const root = match && match[1] ? match[1] : slug;
      let counter = match && match[2] ? (parseInt(match[2], 10) || 1) + 1 : 2;
      let candidateSlug = `${root}-${counter}`;
      while(used.has(candidateSlug)){
        counter += 1;
        candidateSlug = `${root}-${counter}`;
      }
      slug = candidateSlug;
      slugAdjustedMessage = `Slug già utilizzato da una proprietà. Impostato automaticamente su "${slug}".`;
    }
    if(elements.slug) elements.slug.value = slug;
    const formState = gatherFormValues();
    const metadata = {
      slug,
      titolo: elements.title?.value?.trim() || model?.indirizzoRiga1 || slug,
      indirizzoRiga1: formState?.fields?.indirizzoRiga1 || model?.indirizzoRiga1 || '',
      indirizzoRiga2: formState?.fields?.indirizzoRiga2 || model?.indirizzoRiga2 || '',
      dataISO: formState?.fields?.dataISO || model?.dataISO || '',
  propertySlug,
      propertyName: propertyInfo?.nome || '',
      modello: model,
      formState,
      savedAt: new Date().toISOString(),
    };

    const fd = new FormData();
    fd.append('metadata', JSON.stringify(metadata));

    try{
      // Debug: log the cedolare value being saved so we can trace mismatches
      try{ console.log('Saving prospect metadata.percentualeCedolare =', metadata?.formState?.fields?.percentualeCedolare); }catch(e){}
      setStatus('Salvataggio in corso...', 'info');
      const res = await fetch(PROSPECTS_ENDPOINT, { method: 'POST', body: fd });
      if(!res.ok){
        let payload;
        try{
          payload = await res.json();
        }catch(parseErr){
          const fallbackText = await res.text();
          payload = { error: fallbackText || `Status ${res.status}` };
        }
        const errMessage = payload?.error || payload?.message || `Status ${res.status}`;
        throw new Error(errMessage);
      }
      const saved = await res.json();
      currentProspect = saved;
      populatePropertySelect(elements.property, propertySlug);
      if(!elements.propertyDropdown && elements.property){
        elements.property.value = propertySlug || '';
      }
      await refreshList(saved.slug, { silent: true });
      if(elements.selectDropdown){
        elements.selectDropdown.setValue(saved.slug || '', { trigger: false });
      }else if(elements.select){
        elements.select.value = saved.slug;
      }
      fillProspectFields(saved);
      if(slugAdjustedMessage){
        showToast(slugAdjustedMessage, 5000);
      }
      setStatus(slugAdjustedMessage ? `Prospetto salvato correttamente. ${slugAdjustedMessage}` : 'Prospetto salvato correttamente', 'success');
    }catch(err){
      console.error(err);
      setStatus(`Errore durante il salvataggio del prospetto: ${err?.message || 'richiesta non riuscita'}`, 'error');
    }
  };

  const applyInputs = (options = {}) => {
    if(!currentProspect){
      setStatus('Seleziona prima un prospetto da applicare', 'error', options);
      return false;
    }

    let payload = currentProspect?.datiJson;
    if(typeof payload === 'string'){
      try{
        payload = JSON.parse(payload);
        currentProspect.datiJson = payload;
      }catch(err){
        console.warn('Impossibile leggere datiJson del prospetto', err);
        payload = null;
      }
    }

    let state = payload?.formState;
    if(typeof state === 'string'){
      try{
        state = JSON.parse(state);
      }catch(err){
        console.warn('Impossibile leggere formState salvato', err);
        state = null;
      }
    }

    if(state && typeof state === 'object'){
      // restore fields normally
      restoreFormValues(state);
      // Defensive fix: ensure critical numeric inputs (cedolare) are explicitly applied
      try{
        const cedVal = state?.fields?.percentualeCedolare ?? state?.percentualeCedolare ?? null;
        const cedEl = $g('percentualeCedolare');
        if(cedVal !== null && cedEl){
          // log for debugging and apply value
          console.log('Applying percentualeCedolare from saved state:', cedVal, 'currentInputBefore:', cedEl.value);
          cedEl.value = cedVal;
        }
      }catch(e){ console.warn('Error applying percentualeCedolare defensive fix', e); }
      // ensure outputs recalc with the explicit value
      try{ calculateProfit(); }catch(e){ console.warn('calculateProfit() failed after applying saved state', e); }
      const propSlug = state?.propertySlug || currentProspect?.property?.slug || '';
      if(elements.property){
        populatePropertySelect(elements.property, propSlug);
        if(!elements.propertyDropdown){
          elements.property.value = propSlug || '';
        }
        updatePropertyActionState();
      }
      setStatus('Dati applicati al calcolatore', 'success', options);
      // show a visible toast so users notice the apply succeeded
      showToast('Dati applicati al calcolatore', 3000);
      return true;
    }

    setStatus('Il prospetto non contiene dati del calcolatore salvati', 'error', options);
    return false;
  };

  const autoSlug = () => {
    const title = elements.title?.value?.trim();
    const indirizzo = document.getElementById('indirizzoRiga1')?.value?.trim() || '';
    const source = title || indirizzo;
    if(!source){
      setStatus('Inserisci un titolo o un indirizzo per generare lo slug', 'error');
      return;
    }
    const slug = slugify(source);
    if(elements.slug) elements.slug.value = slug;
    setStatus('Slug aggiornato automaticamente', 'success');
  };

  const init = async (options = {}) => {
    elements = {
      wrapper: document.getElementById('prospectManager'),
      select: document.getElementById('prospectSelect'),
      selectDropdown: getDropdown('prospectSelect'),
      refreshBtn: document.getElementById('refreshProspectsBtn'),
      property: document.getElementById('prospectProperty'),
      propertyDropdown: getDropdown('prospectProperty'),
  createPropertyBtn: document.getElementById('createPropertyBtn'),
      propertyOpenBtn: document.getElementById('openPropertyBtn'),
      propertyRefreshBtns: Array.from(document.querySelectorAll('[data-role="refresh-properties"]')),
      slug: document.getElementById('prospectSlug'),
      title: document.getElementById('prospectTitle'),
      saveBtns: Array.from(document.querySelectorAll('[data-role="save-prospect"]')),
      applyBtns: Array.from(document.querySelectorAll('[data-role="apply-prospect"]')),
      resetBtn: document.getElementById('resetProspectFormBtn'),
      slugBtn: document.getElementById('generateSlugBtn'),
      status: document.getElementById('prospectStatus'),
      statusBottom: document.getElementById('prospectStatusBottom'),
      statusEls: Array.from(new Set(document.querySelectorAll('[data-role="prospect-status"]'))),
    };

    if(!elements.wrapper) return;

    config = {
      initialSlug: options.initialSlug || '',
      initialProperty: options.initialProperty || '',
      autoApply: !!options.autoApply,
      autoPrint: !!options.autoPrint,
    };

    try{
      await loadProperties();
    }catch(err){
      console.error('Errore caricamento proprieta', err);
    }
  populatePropertySelect(elements.property, config.initialProperty);
  updatePropertyActionState();

    const handleProspectChange = slug => {
      if(slug){
        loadProspect(slug);
      }else{
        resetForm();
      }
    };
    if(elements.selectDropdown){
      elements.selectDropdown.onChange(value => handleProspectChange(value));
    }else{
      elements.select?.addEventListener('change', e => handleProspectChange(e.target.value));
    }

    const handlePropertyChange = () => {
      updatePropertyActionState();
      refreshList('', { silent: false });
    };
    if(elements.propertyDropdown){
      elements.propertyDropdown.onChange(handlePropertyChange);
    }else{
      elements.property?.addEventListener('change', handlePropertyChange);
    }

    elements.createPropertyBtn?.addEventListener('click', () => {
      window.open(appendApiToHref('pages/property/index.html'), '_blank');
    });

    elements.propertyOpenBtn?.addEventListener('click', () => {
      const slug = getSelectedProperty();
      if(!slug){
        setStatus('Seleziona una proprieta collegata per aprire la scheda.', 'error');
        return;
      }
      const url = appendApiToHref(`pages/property/index.html?slug=${encodeURIComponent(slug)}`);
      window.open(url, '_blank');
    });

    const allPropertyRefreshBtns = elements.propertyRefreshBtns || [];
    allPropertyRefreshBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const previousSelection = getSelectedProperty() || config.initialProperty || '';
        setStatus('Aggiornamento elenco proprieta in corso...', 'info');
        allPropertyRefreshBtns.forEach(b => { b.disabled = true; });
        try{
          await loadProperties(true);
          populatePropertySelect(elements.property, previousSelection);
          updatePropertyActionState();
          setStatus('Elenco proprieta aggiornato.', 'success');
        }catch(err){
          console.error(err);
          setStatus('Errore durante l\'aggiornamento delle proprieta.', 'error');
        }finally{
          allPropertyRefreshBtns.forEach(b => { b.disabled = false; });
        }
      });
    });

    elements.refreshBtn?.addEventListener('click', () => {
      refreshList(getSelectedProspect(), { silent: false });
    });
    (elements.saveBtns || []).forEach(btn => {
      btn.addEventListener('click', saveCurrentProspect);
    });
    (elements.applyBtns || []).forEach(btn => {
      btn.addEventListener('click', () => applyInputs());
    });
    elements.resetBtn?.addEventListener('click', () => resetForm());
    elements.slugBtn?.addEventListener('click', autoSlug);

  resetForm({ silent: true });
  await refreshList(config.initialSlug, { silent: true });

  if(config.initialSlug){
    const prospect = await loadProspect(config.initialSlug, { silent: true, setSelect: true });
    if(!prospect){
      setStatus('Il prospetto richiesto non è stato trovato.', 'error');
      return;
    }
    if(config.autoApply){
      const applied = applyInputs({ silent: config.autoPrint });
      if(config.autoPrint){
        const triggerPrint = () => setTimeout(() => printWithDate({ forceAsync: true }), 600);
        if(applied){
          triggerPrint();
        }else{
          console.warn('Auto stampa: nessun dato applicato, stampa stato corrente.');
          triggerPrint();
        }
      }
    }else{
      setStatus('Prospetto caricato. Usa "Applica dati" per ripristinare i valori.', 'info');
    }
  }else{
    setStatus('Modulo pronto per un nuovo prospetto', 'info');
  }
  updatePropertyActionState();
  };

  return {
    init,
    loadProspectBySlug: (slug, options = {}) => loadProspect(slug, options),
    applyCurrent: (options = {}) => applyInputs(options),
  };
})();


/* ============= Init ============= */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-dropdown]').forEach(root => initDropdown(root));
  // attach inputs that might be dynamically added
  document.querySelectorAll('input, textarea, select').forEach(el=>{
    if(el.closest('#prospectManager')) return;
    el.addEventListener('input', calculateProfit);
    el.addEventListener('change', calculateProfit);
  });
  calculateProfit();
  applyApiToLinks();

  // Inject a small print stylesheet to hide UI controls and transient elements
  // which should not appear in the exported PDF.
  try{
    const css = `@media print {
      #ov-toast, #prospectManager, .prospect-status, .btn, .device-actions, .dropdown, [data-dropdown-menu], .dropdown-item { display: none !important; }
      /* avoid printing obvious controls and links */
      a[href]:after { content: none !important; }
    }`;
    const style = document.createElement('style');
    style.setAttribute('data-generated-by','script-calcolatore:print');
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }catch(e){ console.warn('Could not inject print stylesheet', e); }
  const params = new URLSearchParams(window.location.search);
  const initialSlug = params.get('slug') || '';
  const initialProperty = params.get('property') || '';
  const autoApply = params.has('apply') || params.get('auto') === '1' || !!initialSlug;
  const autoPrint = params.has('print');
  const prefillRaw = params.get('prefill');
  if(prefillRaw){
    try{
      const data = JSON.parse(decodeURIComponent(prefillRaw));
      if(typeof data === 'object' && data){
        if(data.indirizzoRiga1){
          const el = document.getElementById('indirizzoRiga1');
          if(el) el.value = data.indirizzoRiga1;
        }
        if(data.indirizzoRiga2){
          const el = document.getElementById('indirizzoRiga2');
          if(el) el.value = data.indirizzoRiga2;
        }
        if(data.dataISO){
          const el = document.getElementById('dataISO');
          if(el) el.value = data.dataISO;
        }
      }
    }catch(err){
      console.error('Errore nel prefill della proprieta', err);
    }
  }
  prospectManager.init({ initialSlug, initialProperty, autoApply, autoPrint }).catch(err => {
    console.error('Prospect manager init error', err);
  });
});
