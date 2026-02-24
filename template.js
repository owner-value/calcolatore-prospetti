(() => {
  // helpers locali
  const $ = id => document.getElementById(id);
  const eur = n => (new Intl.NumberFormat('it-IT',{
    style:'currency',
    currency:'EUR',
    minimumFractionDigits:2,
    maximumFractionDigits:2
  })).format(Number.isFinite(+n)?+n:0);
  const pct = n => `${Math.round(+n||0)}%`;
  const CACHE_KEY = 'ownervalue:model';
  const DEFAULT_PROD_API = 'https://calcolatore-prospetti.onrender.com';
  const LOCAL_API = 'http://localhost:3001';

  function render(m){
    if(!m || typeof m!=='object') return;

    const d = m?.dataISO ? new Date(m.dataISO) : new Date();
    const dateStr = d.toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'});
    // Set all .date elements to the same formatted date (handles duplicated/misnumbered ids)
    try{ document.querySelectorAll('.date').forEach(el => { if(el) el.textContent = dateStr; }); }catch(_){ }
    // Backwards-compat: also set known ids if present
    ['p1-data','p2-data','p3-data','p4-data','p5-data','p6-data','p7-data'].forEach(id=>{ const el=$(id); if(el) el.textContent=dateStr; });

    if($('p1-indirizzo-riga1')) $('p1-indirizzo-riga1').textContent = m.indirizzoRiga1 || '—';
    if($('p1-indirizzo-riga2')) $('p1-indirizzo-riga2').textContent = m.indirizzoRiga2 || '';

    if($('p4-descr')) $('p4-descr').textContent = m.descrizione || '';
    const ul = $('p4-punti');
    if(ul){ ul.innerHTML=''; (m.puntiDiForza||[]).forEach(t=>{ const li=document.createElement('li'); li.textContent=t; ul.appendChild(li); }); }

    if($('p5-occ'))  $('p5-occ').textContent  = pct(m?.kpi?.occupazionePct ?? 0);
    if($('p5-adr'))  $('p5-adr').textContent  = eur(m?.kpi?.adr ?? 0);
    if($('p5-fatt')) $('p5-fatt').textContent = eur(m?.kpi?.fatturatoLordoNettoPulizie ?? 0);

    if($('p6-pulizie')) $('p6-pulizie').textContent = eur(m?.spese?.pulizie ?? 0);
    const uaVal = m?.spese?.utenzeAmm ?? 0;
    if($('p6-ua'))      $('p6-ua').textContent      = eur(uaVal);
    const uaLabel = $('p6-ua-label');
    if(uaLabel){
      const hasAdmin = Boolean(m?.spese?.includeAmministrazione) ||
        ((m?.spese?.utenzeDettaglio?.amministrazioneMensile ?? 0) > 0) ||
        ((m?.spese?.utenzeDettaglio?.amministrazioneAnnua ?? 0) > 0);
      uaLabel.textContent = hasAdmin ? 'Utenze e amministrazione' : 'Utenze';
    }
    const uaRow = $('p6-ua-row');
    if(uaRow){ uaRow.style.display = uaVal > 0 ? '' : 'none'; }
    if($('p6-ota')){
      $('p6-ota').textContent = eur(m?.spese?.ota ?? 0);
      try{
        const otaEl = $('p6-ota');
        const container = otaEl.closest ? otaEl.closest('.box-row') : otaEl.parentNode;
        if(container){
          const labelSub = container.querySelector('.label-sub');
          if(labelSub){
            const updateOtaLabel = () => {
              let assicurazioneVal = 0;
              // prefer explicit select if present
              const sel = document.getElementById('assicurazionePerSoggiorno');
              if(sel){
                const v = parseFloat(sel.value || '0');
                assicurazioneVal = Number.isFinite(v) ? Math.max(0, v * (document.getElementById('previewNumSoggiorni') ? parseFloat((document.getElementById('previewNumSoggiorni').textContent||'').replace(/[^0-9\.]/g,'')) || 0 : 0)) : 0;
                // if select holds a per-stay amount, the previewAssicurazioneAnnuo may be more reliable; try preview as fallback
                if(assicurazioneVal === 0){
                  const preview = document.getElementById('previewAssicurazioneAnnuo');
                  if(preview){
                    const txt = (preview.textContent || preview.innerText || '').trim();
                    const s = txt.replace(/[^0-9,\-.]/g,'').replace(/\./g,'').replace(',', '.');
                    const n = parseFloat(s);
                    assicurazioneVal = Number.isFinite(n) ? n : 0;
                  } else {
                    assicurazioneVal = Number(m?.spese?.assicurazione ?? 0);
                  }
                }
              } else {
                const preview = document.getElementById('previewAssicurazioneAnnuo');
                if(preview){
                  const txt = (preview.textContent || preview.innerText || '').trim();
                  const s = txt.replace(/[^0-9,\-.]/g,'').replace(/\./g,'').replace(',', '.');
                  const n = parseFloat(s);
                  assicurazioneVal = Number.isFinite(n) ? n : 0;
                } else {
                  assicurazioneVal = Number(m?.spese?.assicurazione ?? 0);
                }
              }
              const pctVal = pct(m?.spese?.otaPct ?? 20);
              if(assicurazioneVal > 0){
                labelSub.innerHTML = `(<span id="p6-ota-percent">${pctVal}</span> su affitti + pulizie + assicurazione)`;
              } else {
                labelSub.innerHTML = `(<span id="p6-ota-percent">${pctVal}</span> su affitti + pulizie)`;
              }
            };
            // initial
            updateOtaLabel();
            // listen to select changes
            try{
              const sel = document.getElementById('assicurazionePerSoggiorno');
              if(sel) sel.addEventListener('change', updateOtaLabel);
            }catch(_){ }
            // observe preview changes as well
            try{
              const preview = document.getElementById('previewAssicurazioneAnnuo');
              if(preview && 'MutationObserver' in window){
                const mo = new MutationObserver(() => updateOtaLabel());
                mo.observe(preview, { characterData: true, childList: true, subtree: true });
              }
            }catch(_){ }
          }
        }
      }catch(_){ }
    }
    if($('p6-kit'))     $('p6-kit').textContent     = eur(m?.spese?.kit ?? 0);
    const assVal = m?.spese?.assicurazione ?? 0;
    if($('p6-assicurazione')) $('p6-assicurazione').textContent = eur(assVal);
    const assRow = $('p6-assicurazione-row');
    if(assRow) assRow.style.display = assVal > 0 ? '' : 'none';
    const assSub = $('p6-assicurazione-sub');
    if(assSub){
      if(assVal > 0){
  const perStay = Number(m?.spese?.assicurazioneDettaglio?.perPrenotazione ?? 0);
        const label = m?.spese?.assicurazioneDettaglio?.label || '';
        const parts = [];
        if(label) parts.push(label);
        if(Number.isFinite(perStay) && perStay > 0){
          parts.push(`€ ${perStay.toFixed(2).replace('.', ',')} / prenotazione`);
        }
        assSub.textContent = parts.join(' • ');
      }else{
        assSub.textContent = '';
      }
    }
    if($('p6-pm'))      $('p6-pm').textContent      = eur(m?.spese?.pm ?? 0);
    if($('p6-pm-pct'))   $('p6-pm-pct').textContent   = `${pct(m?.spese?.pmPct ?? m?.percentualePm ?? 0)} + IVA 22%`;
    // Update Ring label (show monthly amount) but do NOT render a Ring box in Start-up
    try{
      const setup = m?.spese?.ringSetup ?? 0;
      let subMonth = 0;
      if (typeof m?.spese?.sicurezza?.ringSubMonth === 'number') {
        subMonth = m.spese.sicurezza.ringSubMonth;
      } else if (typeof m?.spese?.abbonamentoMensile === 'number') {
        subMonth = m.spese.abbonamentoMensile;
      } else if (m?.spese?.sicurezza?.ringSubAnn) {
        subMonth = m.spese.sicurezza.ringSubAnn / 12;
      }
      if($('p6-ring-label')){
        if(subMonth > 0){
          $('p6-ring-label').innerHTML = `Ring Intercom<br><span style="font-weight:400;font-size:0.95em">${eur(subMonth)} al mese di abbonamento</span>`;
        } else {
          $('p6-ring-label').innerHTML = 'Ring Intercom';
        }
      }
    }catch(_){ }
    if($('p6-una')){
      const sicurezza = m?.spese?.sicurezza || {};
      // DO NOT sum extras here; show only the Kit amount
      const kitOnly = typeof sicurezza.extraManuale === 'number' ? Math.max(0, sicurezza.extraManuale) : 0;
      $('p6-una').textContent = kitOnly > 0 ? eur(kitOnly) : '—';
    }
    // Ring Intercom una tantum
    if($('p6-ring-setup')){
      const setup = m?.spese?.ringSetup ?? 0;
      $('p6-ring-setup').textContent = setup > 0 ? eur(setup) : '—';
    }
    // Do NOT override the static label in the report
    // p6-una-label must remain unchanged by dynamic data
    // Intentionally no-op here to preserve original label

    renderOptionalExtras();
    recalculateTotalCosti();
    reorderOptionalExtras();

    // Recalculate Startup total (one-time costs)
    try{ recalculateTotaleStartup(); }catch(_){ }

    if($('p7-utile-lordo'))   $('p7-utile-lordo').textContent   = eur(m?.risultati?.utileLordo ?? 0);
    if($('p7-utile-netto'))   $('p7-utile-netto').textContent   = eur(m?.risultati?.utileNetto ?? 0);
    if($('p7-mensile-netto')) $('p7-mensile-netto').textContent = eur(m?.risultati?.mensileNetto ?? 0);
    // Ensure startup containers are placed in the Start-up page info container
    try{ moveStartupContainers(); }catch(_){ }
  }

  // Force-move startup-related containers/boxes into the Start-up page info-container
  function moveStartupContainers(){
    try{
      // Prefer explicit Start-up container by using parent of p6-ring-setup-row
      let startupInfo = null;
      const ringSetupRow = document.getElementById('p6-ring-setup-row');
      if(ringSetupRow && ringSetupRow.parentNode && ringSetupRow.parentNode.classList && ringSetupRow.parentNode.classList.contains('info-container')){
        startupInfo = ringSetupRow.parentNode;
      }
      if(!startupInfo){
        const startupPage = Array.from(document.querySelectorAll('.page'))
          .find(p => (p.querySelector('.h2')?.textContent || '').toLowerCase().includes('start'));
        startupInfo = startupPage ? startupPage.querySelector('.info-container') : null;
      }
      if(!startupInfo) return;

      const moveIfPresent = (el) => {
        if(!el) return;
        if(el.parentNode !== startupInfo) startupInfo.appendChild(el);
      };

      // Move known containers
      const extrasCont = document.getElementById('p6-extras-container');
      const optExtras = document.getElementById('p6-optional-extras');
      const totalStartupRow = document.getElementById('p6-totale-startup-row');
      // Prefer inserting extras BEFORE the Totale Start-up row so they appear above the total
      const insertBeforeTarget = totalStartupRow && totalStartupRow.parentNode === startupInfo ? totalStartupRow : null;
      if(extrasCont){
        if(insertBeforeTarget) startupInfo.insertBefore(extrasCont, insertBeforeTarget);
        else moveIfPresent(extrasCont);
      }
      if(optExtras){
        if(insertBeforeTarget) startupInfo.insertBefore(optExtras, insertBeforeTarget);
        else moveIfPresent(optExtras);
      }

      // Move any generated p6-extra-* boxes
      const gen = Array.from(document.querySelectorAll('[id^="p6-extra-"]'));
      gen.forEach(el=> {
        if(!el) return;
        if(insertBeforeTarget && el.parentNode !== startupInfo){
          startupInfo.insertBefore(el, insertBeforeTarget);
        } else {
          moveIfPresent(el);
        }
      });
    }catch(e){ /* ignore */ }
  }

  const sanitizeBase = base => (base || '').toString().replace(/\/$/, '');

  function resolveApiBase(){
    try{
      if(typeof window !== 'undefined'){
        const override = (window.CALCOLATORE_API || '').toString().trim();
        if(override) return sanitizeBase(override);
      }
    }catch(err){ /* ignore */ }
    try{
      if(typeof API_BASE_URL !== 'undefined' && API_BASE_URL){
        return sanitizeBase(API_BASE_URL);
      }
    }catch(err){ /* ignore */ }
    try{
      const host = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
      if(['localhost','127.0.0.1','0.0.0.0'].includes(host)) return LOCAL_API;
    }catch(err){ /* ignore */ }
    return DEFAULT_PROD_API;
  }

  function extractModel(payload){
    if(!payload) return null;
    let data = payload.datiJson ?? payload.modello ?? payload.model ?? payload;
    if(typeof data === 'string'){
      try{ data = JSON.parse(data); }
      catch(err){ console.warn('Report: datiJson non valido', err); return null; }
    }
    if(!data || typeof data !== 'object') return null;
    if(Array.isArray(data)) return null;
    const model = data.modello && typeof data.modello === 'object' ? data.modello : data;
    return model && typeof model === 'object' ? model : null;
  }

  function persistModel(model){
    if(!model) return;
    try{ localStorage.setItem(CACHE_KEY, JSON.stringify(model)); }
    catch(err){ console.warn('Report: impossibile salvare il modello in locale', err); }
  }

  // Live updates from calculator (same-origin embed)
  try{
    window.addEventListener('message', (e) => {
      const d = e && e.data;
      if(!d) return;

      // Handle live updates
      if(d.type === 'ov:update'){
        try{
          const el = d.field ? document.getElementById(d.field) : null;
          if(el && typeof d.value === 'string') el.textContent = d.value;
          // Special handling: hide annual Ring row when zero
          if(d.field === 'p6-ring-annual'){
            try{
              const txt = (d.value || '').toString();
              const s = txt.replace(/[^0-9,\-.]/g,'').replace(/\./g,'').replace(',', '.');
              const n = parseFloat(s);
              const row = document.getElementById('p6-ring-annual-row');
              if(row){ row.style.display = (Number.isFinite(n) && n > 0) ? '' : 'none'; }
            }catch(_){ }
          }
        }catch(_){ }
        try{
          if(['p6-ring-annual','p6-ring-setup','p6-una','p6-kit','p6-ota','p6-extras-container'].includes(d.field)){
            recalculateTotalCosti();
            try{ recalculateTotaleStartup(); }catch(_){ }
          }
        }catch(_){ }
        return;
      }

      // Allow explicit reparenting request from calculator
      if(d.type === 'ov:reparent-startup'){
        try{ moveStartupContainers(); recalculateTotaleStartup(); }catch(_){ }
        return;
      }
    });
  }catch(err){ /* ignore */ }

  // Calcola il totale dei costi di Start-up (una tantum) presenti nella pagina Start-up
  function recalculateTotaleStartup(){
    try{
      // Find startup info container
      let startupInfo = null;
      const ringSetupRow = document.getElementById('p6-ring-setup-row');
      if(ringSetupRow && ringSetupRow.parentNode && ringSetupRow.parentNode.classList && ringSetupRow.parentNode.classList.contains('info-container')){
        startupInfo = ringSetupRow.parentNode;
      }
      if(!startupInfo){
        const startupPage = Array.from(document.querySelectorAll('.page')).find(p => (p.querySelector('.h2')?.textContent || '').toLowerCase().includes('start'));
        startupInfo = startupPage ? startupPage.querySelector('.info-container') : null;
      }
      if(!startupInfo) return;

      const parseMoney = (txt) => {
        if(!txt) return 0;
        const s = txt.replace(/[^0-9,,-.]/g,'').replace(/\./g,'').replace(',', '.');
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : 0;
      };

      let total = 0;
      const bigEls = startupInfo.querySelectorAll('.box.expense-box .big');
      for(const el of bigEls){
        if(!el || !el.offsetParent) continue; // skip hidden
        const id = el.id || '';
        // Exclude monthly Ring display (p6-ring) from one-time total
        if(id === 'p6-ring') continue;
        const txt = (el.textContent || '').trim();
        if(txt && txt !== '—') total += parseMoney(txt);
      }

      const out = document.getElementById('p6-totale-startup');
      if(out) out.textContent = eur(total);
    }catch(e){ /* ignore */ }
  }

  // Ricalcolo totale spese basato su quanto visualizzato in UI
  function recalculateTotalCosti(){
    try{
      const parseMoney = (txt) => {
        if(!txt) return 0;
        const s = txt.replace(/[^0-9,,-.]/g,'').replace(/\./g,'').replace(',', '.');
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : 0;
      };
      // Only count items that are part of the annual "Previsioni di Spesa" page.
      // Exclude known start-up items (Kit Sicurezza, Ring setup and extras injected into #p6-extras-container).
      const startupIds = new Set(['p6-una','p6-ring-setup']);
      let total = 0;
      try{
        const totalRow = document.getElementById('p6-totale-costi-row');
        const pageEl = totalRow && totalRow.closest ? totalRow.closest('.page') : null;
        // Fallback to document if page element not found
        const container = pageEl || document;

        // Sum all visible "big" values inside the same page's expense boxes,
        // skipping any element whose id is a known startup id.
        const bigEls = container.querySelectorAll('.box.expense-box .big');
        for(const el of bigEls){
          if(!el || !el.offsetParent) continue; // skip hidden
          const id = el.id || '';
          if(id && startupIds.has(id)) continue;
          const txt = (el.textContent || '').trim();
          if(txt && txt !== '—') total += parseMoney(txt);
        }

        // Device extras (from #deviceCostsContainer) are start-up costs and must NOT be
        // included in the annual Totale Spese. Do not add them here.

        // Include optional extras only if the optional container is inside the same page and the flag is enabled
        try{
          const include = document.getElementById('includeOptionalExtras');
          const optContainer = document.getElementById('optionalCostsContainer');
          if(include && include.checked && optContainer){
            const optPage = optContainer.closest ? optContainer.closest('.page') : null;
            if(!optPage || optPage === pageEl){
              const optInputs = optContainer.querySelectorAll('[data-type="opt-amount"]');
              for(const inp of optInputs){
                const val = (inp && 'value' in inp) ? inp.value : '';
                total += parseMoney(String(val));
              }
            }
          }
        }catch(_){}
      }catch(_){}

      const totEl = $('p6-totale-costi');
      if(totEl) totEl.textContent = eur(total);
    }catch(err){ /* ignore */ }
  }

  // Posiziona #p6-optional-extras in base a data-persist-ignore
  function reorderOptionalExtras(){
    try{
      const extras = document.getElementById('p6-optional-extras');
      if(!extras) return;
      const persistIgnore = (extras.getAttribute('data-persist-ignore') || '').toLowerCase();
      // Trova sempre un container valido nel report, mai il <body>
      let infoContainer = document.querySelector('#page6 .info-container');
      // If extras have data-persist-ignore=true, prefer placing them into the Start-up page
      if(persistIgnore === 'true'){
        try{
          // Prefer explicit Start-up container by locating the parent of p6-ring-setup-row
          const ringSetupRow = document.getElementById('p6-ring-setup-row');
          if(ringSetupRow && ringSetupRow.parentNode && ringSetupRow.parentNode.classList && ringSetupRow.parentNode.classList.contains('info-container')){
            infoContainer = ringSetupRow.parentNode;
          } else {
            const startupPage = Array.from(document.querySelectorAll('.page'))
              .find(p => (p.querySelector('.h2')?.textContent || '').toLowerCase().includes('start'));
            const startupInfo = startupPage ? startupPage.querySelector('.info-container') : null;
            if(startupInfo) infoContainer = startupInfo;
          }
        }catch(_){ /* ignore */ }
      }
      if(!infoContainer){
        try{
          if(extras.closest) infoContainer = extras.closest('.info-container');
          if(!infoContainer) infoContainer = extras.parentNode || null;
        }catch(_) { /* ignore */ }
      }
      if(!infoContainer) return;
      const totalRow = document.getElementById('p6-totale-costi-row');
      const otaRow = document.getElementById('p6-ota-row');
      if(persistIgnore === 'true'){
        if(totalRow && totalRow.parentNode === infoContainer){
          // inserisci subito dopo il totale spese
          const afterTotal = totalRow.nextSibling;
          if(afterTotal){ infoContainer.insertBefore(extras, afterTotal); }
          else { infoContainer.appendChild(extras); }
        }else{
          // fallback: append in fondo al container
          infoContainer.appendChild(extras);
        }
      }else{
        // posiziona prima delle commissioni OTA
        if(otaRow && otaRow.parentNode === infoContainer){
          infoContainer.insertBefore(extras, otaRow);
        }
      }
    }catch(_) { /* ignore */ }
  }

  // Genera riassunto e box per le spese opzionali nel prospetto
  function renderOptionalExtras(){
    try{
      const cont = document.getElementById('optionalCostsContainer');
      const list = [];
      if(cont){
        const rows = cont.querySelectorAll('.opt-row');
        rows.forEach((row, idx) => {
          const nameEl = row.querySelector('[data-type="opt-name"]');
          const amountEl = row.querySelector('[data-type="opt-amount"]');
          const name = (nameEl && nameEl.value || '').trim();
          const raw = (amountEl && amountEl.value) || '';
          const amt = parseFloat(String(raw).replace(',', '.'));
          if(Number.isFinite(amt) && amt > 0){
            list.push({ name: name || `Extra ${idx+1}`, amount: amt });
          }
        });
      }

      // Aggiorna il riassunto
      const sumRow = document.getElementById('p6-optional-summary-row');
      if(sumRow){
        const lbl = sumRow.querySelector('.lbl');
        if(lbl){ lbl.textContent = list.length ? list.map(x=>x.name).join('; ') : '—'; }
        const big = sumRow.querySelector('.big');
        if(big){
          const total = list.reduce((a,b)=>a+b.amount,0);
          big.textContent = eur(total);
        }
      }

      // Ricostruisci i box singoli nel prospetto
      const extrasContainer = document.getElementById('p6-optional-extras');
      if(extrasContainer){
        // pulisci
        extrasContainer.innerHTML = '';
        const include = document.getElementById('includeOptionalExtras');
        const includeChecked = include ? !!include.checked : false;
        list.forEach((item, i) => {
          const box = document.createElement('div');
          box.className = 'box expense-box';
          box.id = `p6-opt-${i+1}`;
          box.innerHTML = `
            <div class="box-row">
              <div class="label-stack">
                <div class="lbl"></div>
                <div class="label-sub optional-note">OPZIONALE${includeChecked ? '' : ' • Non incluso nel totale'}</div>
              </div>
              <div class="big"></div>
            </div>`;
          box.querySelector('.lbl').textContent = item.name;
          box.querySelector('.big').textContent = eur(item.amount);
          extrasContainer.appendChild(box);
        });
      }
    }catch(_) { /* ignore */ }
  }

  function loadFromCache(){
    try{
      const raw = localStorage.getItem(CACHE_KEY);
      if(!raw) return false;
      render(JSON.parse(raw));
      return true;
    }catch(e){ console.error('Report: model non valido', e); }
    return false;
  }

  async function fetchAndRender(slug){
    if(!slug) return false;
    const base = resolveApiBase();
    const url = `${base}/api/prospetti/${encodeURIComponent(slug)}`;
    try{
      const res = await fetch(url, { credentials: 'omit' });
      if(!res.ok){
        console.warn('Report: caricamento prospetto fallito', res.status, url);
        return false;
      }
      const payload = await res.json();
      const model = extractModel(payload);
      if(!model){
        console.warn('Report: nessun modello valido nel prospetto caricato');
        return false;
      }
      render(model);
      persistModel(model);
      return true;
    }catch(err){
      console.error('Report: errore nel recupero del prospetto', err);
      return false;
    }
  }

  function handleStorage(event){
    if(event && event.key && event.key !== CACHE_KEY) return;
    loadFromCache();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const fallbackUsed = loadFromCache();
    // assicurati che l'ordine iniziale sia corretto
    reorderOptionalExtras();
    // Osserva cambi attributo data-persist-ignore per riordinare subito
    try{
      const extras = document.getElementById('p6-optional-extras');
      if(extras && 'MutationObserver' in window){
        const mo = new MutationObserver((mutList) => {
          for(const m of mutList){
            if(m.type === 'attributes' && m.attributeName === 'data-persist-ignore'){
              reorderOptionalExtras();
              break;
            }
          }
        });
        mo.observe(extras, { attributes: true, attributeFilter: ['data-persist-ignore'] });
      }
    }catch(_) { /* ignore */ }

    // Sincronizza stile evidenziato e posizione extras-container in base al checkbox
    try{
      const include = document.getElementById('includeOptionalExtras');
      const optExtras = document.getElementById('p6-optional-extras');
      const extrasContainer = document.getElementById('p6-extras-container');
      const syncVisualState = () => {
        if(!include) return;
        // bordo verde quando checkbox è false
        if(optExtras){
          if(include.checked){ optExtras.classList.remove('optional-green'); }
          else { optExtras.classList.add('optional-green'); }
        }
        // se checkbox è false, sposta #p6-extras-container subito dopo il totale spese
        try{
          if(extrasContainer){
            if(!include.checked){
              const totalRow = document.getElementById('p6-totale-costi-row');
              const parent = totalRow && totalRow.parentNode;
              if(parent){
                const afterTotal = totalRow.nextSibling;
                if(afterTotal){ parent.insertBefore(extrasContainer, afterTotal); }
                else { parent.appendChild(extrasContainer); }
              }
            }
            // se true: lasciamo extrasContainer dove si trova (nessun riposizionamento richiesto)
          }
        }catch(_) { /* ignore */ }
        recalculateTotalCosti();
      };
      if(include){
        include.addEventListener('change', syncVisualState);
        // inizializza
        syncVisualState();
      }
    }catch(_) { /* ignore */ }
    // Aggiorna il totale quando l'utente modifica spese extra dinamiche
    try{
      const delegate = (evtName) => {
        document.addEventListener(evtName, (e) => {
          const t = e.target;
          if(t && t.matches && t.matches('[data-type="device-amount"]')){
            recalculateTotalCosti();
          }
          if(t && t.matches && t.matches('#optionalCostsContainer [data-type="opt-amount"]')){
            recalculateTotalCosti();
          }
        }, true);
      };
      ['input','change'].forEach(delegate);
    }catch(_) { /* ignore */ }
    // Ricalcola automaticamente quando si aggiungono/rimuovono righe opzionali
    try{
      const optContainer = document.getElementById('optionalCostsContainer');
      if(optContainer && 'MutationObserver' in window){
        const mo = new MutationObserver(() => recalculateTotalCosti());
        mo.observe(optContainer, { childList: true, subtree: true });
      }
    }catch(_) { /* ignore */ }
    // Aggiorna quando si abilita/disabilita l'inclusione opzionale
    try{
      const include = document.getElementById('includeOptionalExtras');
      const optContainer = document.getElementById('p6-optional-extras');
      const syncOptionalState = () => {
        if(!include) return;
        if(optContainer){
          if(include.checked) optContainer.classList.add('active');
          else optContainer.classList.remove('active');
        }
        recalculateTotalCosti();
      };
      if(include){
        include.addEventListener('change', syncOptionalState);
        // inizializza stato alla load
        syncOptionalState();
      }
    }catch(_) { /* ignore */ }
    try{
      const params = new URLSearchParams(window.location.search);
      const slug = params.get('slug') || '';
      if(slug){
        fetchAndRender(slug).then(success => {
          if(!success && !fallbackUsed){
            console.warn('Report: utilizzo del modello locale di fallback');
          }
        });
      }
    }catch(err){ console.error('Report: errore nel parsing degli URL params', err); }
  });

  window.addEventListener('storage', handleStorage);
})();
