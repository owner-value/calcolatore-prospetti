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
    if($('p6-ota'))     $('p6-ota').textContent     = eur(m?.spese?.ota ?? 0);
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
    if($('p6-pm-pct'))   $('p6-pm-pct').textContent   = pct(m?.spese?.pmPct ?? m?.percentualePm ?? 0);
    if($('p6-ring')){
      const ringTot = (m?.spese?.ringTotale ?? (m?.spese?.ringSetup ?? 0) + (m?.spese?.ringSubAnn ?? 0)) || 0;
      $('p6-ring').textContent = eur(ringTot);
    }
    if($('p6-una')){
      const sicurezza = m?.spese?.sicurezza || {};
      // DO NOT sum extras here; show only the Kit amount
      const kitOnly = typeof sicurezza.extraManuale === 'number' ? Math.max(0, sicurezza.extraManuale) : 0;
      $('p6-una').textContent = kitOnly > 0 ? eur(kitOnly) : '—';
    }
    // Do NOT override the static label in the report
    // p6-una-label must remain unchanged by dynamic data
    // Intentionally no-op here to preserve original label

    recalculateTotalCosti();

    if($('p7-utile-lordo'))   $('p7-utile-lordo').textContent   = eur(m?.risultati?.utileLordo ?? 0);
    if($('p7-utile-netto'))   $('p7-utile-netto').textContent   = eur(m?.risultati?.utileNetto ?? 0);
    if($('p7-mensile-netto')) $('p7-mensile-netto').textContent = eur(m?.risultati?.mensileNetto ?? 0);
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
      if(!d || d.type !== 'ov:update') return;
      if(d.field === 'p6-ring'){
        const el = document.getElementById('p6-ring');
        if(el && typeof d.value === 'string') el.textContent = d.value;
        recalculateTotalCosti();
      }
    });
  }catch(err){ /* ignore */ }

  // Ricalcolo totale costi basato su quanto visualizzato in UI
  function recalculateTotalCosti(){
    try{
      const parseMoney = (txt) => {
        if(!txt) return 0;
        const s = txt.replace(/[^0-9,,-.]/g,'').replace(/\./g,'').replace(',', '.');
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : 0;
      };
      const ids = ['p6-pulizie','p6-ua','p6-una','p6-ring','p6-kit','p6-assicurazione','p6-ota','p6-pm','p6-cedolare'];
      let total = ids.reduce((sum,id)=>{
        const el = $(id);
        const t = el ? (el.textContent || '').trim() : '';
        return sum + (t && t !== '—' ? parseMoney(t) : 0);
      },0);

      // Somma importi extra dichiarati nel DOM tramite data-type
      // Supportiamo due modalità:
      //  - elementi con data-type="device-amount" e testo/valore formattato in €
      //  - input con data-type="device-amount" dove il valore è digitato dall'utente
      try{
        const extras = Array.from(document.querySelectorAll('[data-type="device-amount"]'));
        for(const el of extras){
          const val = ('value' in el) ? (el.value || el.getAttribute('data-amount') || '') : (el.textContent || el.getAttribute('data-amount') || '');
          total += parseMoney(String(val).trim());
        }
      }catch(_) { /* ignore */ }

      // Somma importi extra dentro il container dedicato (markup reale)
      try{
        const nodes = document.querySelectorAll('#p6-extras-container .box.expense-box .big');
        for(const el of nodes){
          const t = (el.textContent || '').trim();
          if(t && t !== '—') total += parseMoney(t);
        }
      }catch(_) { /* ignore */ }

      const totEl = $('p6-totale-costi');
      if(totEl) totEl.textContent = eur(total);
    }catch(err){ /* ignore */ }
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
    // Aggiorna il totale quando l'utente modifica spese extra dinamiche
    try{
      const delegate = (evtName) => {
        document.addEventListener(evtName, (e) => {
          const t = e.target;
          if(t && t.matches && t.matches('[data-type="device-amount"]')){
            recalculateTotalCosti();
          }
        }, true);
      };
      ['input','change'].forEach(delegate);
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
