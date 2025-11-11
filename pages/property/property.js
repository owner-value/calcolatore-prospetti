// Bootstrap API override from query/hash/localStorage.
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

// Prefer an explicitly set global, otherwise auto-detect and fall back between production/local
const DEFAULT_PROD_API = 'https://calcolatore-prospetti.onrender.com';
const LOCAL_API = 'http://localhost:3001';

const sanitizeBaseUrl = value => {
  if(!value) return '';
  return value.toString().trim().replace(/\/$/, '');
};

const isLocalHost = (() => {
  try{
    return ['localhost','127.0.0.1','0.0.0.0'].includes(location.hostname);
  }catch(err){
    return false;
  }
})();

const API_CANDIDATES = (() => {
  const list = [];
  const push = value => {
    const clean = sanitizeBaseUrl(value);
    if(clean && !list.includes(clean)) list.push(clean);
  };
  if(window.CALCOLATORE_API){
    push(window.CALCOLATORE_API);
  }
  push(DEFAULT_PROD_API);
  push(LOCAL_API);
  return list.length ? list : [DEFAULT_PROD_API];
})();

const API_STORAGE_KEY = 'calcolatore:api-base';
const DEAD_API_BASES = new Set();

let apiCandidateIndex = 0;
let API_BASE_URL = API_CANDIDATES[apiCandidateIndex];
let ENCODED_API_BASE = encodeURIComponent(API_BASE_URL);

function setActiveApiBase(base){
  const clean = sanitizeBaseUrl(base);
  if(!clean || clean === API_BASE_URL) return;
  API_BASE_URL = clean;
  ENCODED_API_BASE = encodeURIComponent(API_BASE_URL);
  try{ applyApiToLinks(); }catch(err){ /* ignore */ }
}

function getApiBase(){
  return API_BASE_URL;
}

const PROPERTIES_PATH = '/api/properties';
const PROSPECTS_PATH = '/api/prospetti';
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

async function apiFetch(path = '', options = {}){
  const total = API_CANDIDATES.length;
  const startIndex = apiCandidateIndex % total;
  let lastError = null;
  let lastResponse = null;

  const RETRY_STATUSES = new Set([404, 500, 502, 503, 504]);
  const shouldRetryStatus = status => RETRY_STATUSES.has(status);

  const markBaseAsDead = base => {
    if(!base) return;
    DEAD_API_BASES.add(base);
    try{
      const override = sanitizeBaseUrl(window.CALCOLATORE_API || '');
      if(override && override === base){
        try{ localStorage.removeItem(API_STORAGE_KEY); }catch(err){ /* ignore */ }
        try{ delete window.CALCOLATORE_API; }catch(err){ /* ignore */ }
      }
    }catch(err){ /* ignore */ }
  };

  const ensureOptions = opts => {
    if(!opts || typeof opts !== 'object') return {};
    const cloned = { ...opts };
    if(opts.headers && typeof opts.headers === 'object'){
      cloned.headers = opts.headers instanceof Headers ? new Headers(opts.headers) : { ...opts.headers };
    }
    return cloned;
  };

  for(let offset = 0; offset < total; offset++){
    const idx = (startIndex + offset) % total;
    const base = API_CANDIDATES[idx];
    if(!base || DEAD_API_BASES.has(base)){
      continue;
    }
    const isAbsolute = /^https?:\/\//i.test(path);
    const normalizedPath = isAbsolute
      ? path
      : path.startsWith('/') ? path : `/${path}`;
    const url = isAbsolute ? normalizedPath : `${base}${normalizedPath}`;
    try{
      const response = await fetch(url, ensureOptions(options));
      if(response.ok){
        setActiveApiBase(base);
        apiCandidateIndex = idx;
        return response;
      }

      lastResponse = response;
      const isLastAttempt = (offset === total - 1);
      if(isLastAttempt || !shouldRetryStatus(response.status)){
        setActiveApiBase(base);
        apiCandidateIndex = idx;
        return response;
      }
    }catch(err){
      lastError = err;
      const isNetworkError = err && (err.name === 'TypeError' || err instanceof TypeError || err.name === 'AbortError');
      if(isNetworkError){
        markBaseAsDead(base);
      }
      if(!isNetworkError || offset === total - 1){
        throw err;
      }
    }
  }

  if(lastResponse) return lastResponse;
  throw lastError || new Error('API request failed');
}

const $ = id => document.getElementById(id);

let currentSlug = '';
let currentProperty = null;

const slugify = value => {
  return (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

const getProperty = async slug => {
  if(!slug) return null;
  try{
  const res = await apiFetch(`${PROPERTIES_PATH}/${encodeURIComponent(slug)}`);
    if(res.status === 404) return null;
    if(!res.ok) throw new Error(`Status ${res.status}`);
    return await res.json();
  }catch(err){
    console.error('Errore recupero proprieta', err);
    return null;
  }
};

const getProspect = async slug => {
  if(!slug) return null;
  try{
  const res = await apiFetch(`${PROSPECTS_PATH}/${encodeURIComponent(slug)}`);
    if(res.status === 404) return null;
    if(!res.ok) throw new Error(`Status ${res.status}`);
    return await res.json();
  }catch(err){
    console.error('Errore recupero prospetto', err);
    return null;
  }
};

const ensureUniqueSlug = async (candidate, originalSlug='') => {
  let base = slugify(candidate);
  if(!base) return '';
  let slug = base;
  let attempts = 0;
  while(true){
    if(originalSlug && slug === originalSlug) return slug;
    const [existingProperty, existingProspect] = await Promise.all([
      getProperty(slug),
      getProspect(slug),
    ]);
    if(!existingProperty && !existingProspect) return slug;
    if(originalSlug && (existingProperty?.slug === originalSlug || existingProspect?.slug === originalSlug)) return slug;
    attempts += 1;
    const suffix = attempts > 5 ? Date.now().toString(36) : Math.random().toString(36).slice(2,6);
    slug = `${base}-${suffix}`;
  }
};

const fmtDate = iso => {
  if(!iso) return '--';
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return '--';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
};

const escapeHtml = value => {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const str = `${value ?? ''}`;
  return str.replace(/[&<>"']/g, s => map[s]);
};

const setStatus = (id, message = '', type = 'info') => {
  const el = $(id);
  if(!el) return;
  el.textContent = message;
  el.className = 'status';
  if(message){
    el.classList.add(type);
  }
};

const fillForm = property => {
  $('propertyTitle').textContent = property ? property.nome || property.slug : 'Nuova proprieta';
  $('propertyName').value = property?.nome || '';
  $('propertySlug').value = property?.slug || '';
  $('propertyAddress').value = property?.indirizzo || '';
  $('propertyCity').value = property?.citta || '';
  $('ownerName').value = property?.ownerNome || '';
  $('ownerEmail').value = property?.ownerEmail || '';
  $('ownerPhone').value = property?.ownerTelefono || '';
  $('propertyNote').value = property?.note || '';

  const hasSlug = !!property?.slug;
  $('newProspectBtn').disabled = !hasSlug;
  $('deletePropertyBtn').disabled = !hasSlug;
  if(hasSlug){
    $('newProspectBtn').dataset.slug = property.slug;
    $('deletePropertyBtn').dataset.slug = property.slug;
  }else{
    $('newProspectBtn').removeAttribute('data-slug');
    $('deletePropertyBtn').removeAttribute('data-slug');
  }
};

const renderProspects = (items = []) => {
  const container = $('propertyProspects');
  if(!container) return;
  if(!items.length){
    container.innerHTML = '<div class="archive-empty">Nessun prospetto collegato.</div>';
    applyApiToLinks(container);
    return;
  }

  const cards = items.map(item => {
    const title = escapeHtml(item.titolo || item.indirizzo1 || item.slug);
    const slugEsc = escapeHtml(item.slug);
    const slugEnc = encodeURIComponent(item.slug);
    const indirizzo = [item.indirizzo1, item.indirizzo2].filter(Boolean).join(' - ');
    const indirizzoHtml = escapeHtml(indirizzo);
    const updated = fmtDate(item.updatedAt);
    const calcUrl = appendApiToHref(`../../index.html?slug=${slugEnc}&apply=1`);
    const printUrl = appendApiToHref(`../../index.html?slug=${slugEnc}&apply=1&print=1`);
    return `
      <article class="prospect-card">
        <header>
          <h3>${title}</h3>
          <span class="slug-chip">${slugEsc}</span>
        </header>
        <div class="prospect-meta">
          <div>
            <span class="label">Indirizzo</span>
            <span>${indirizzoHtml || '--'}</span>
          </div>
          <div>
            <span class="label">Aggiornato</span>
            <span>${updated}</span>
          </div>
        </div>
        <div class="prospect-actions">
          <a class="btn" href="${calcUrl}" target="_blank" rel="noopener">Apri nel calcolatore</a>
          <a class="btn btn-secondary" href="${printUrl}" target="_blank" rel="noopener">Apri e stampa</a>
          <button class="btn btn-danger" type="button" data-action="delete-prospect" data-slug="${slugEsc}">Elimina</button>
        </div>
      </article>
    `;
  });

  container.innerHTML = cards.join('');
  applyApiToLinks(container);
};

const handleProspectDelete = async slug => {
  const slugTrim = (slug || '').trim();
  if(!slugTrim) return;
  const ok = window.confirm(`Eliminare il prospetto "${slugTrim}"? L'operazione non puo essere annullata.`);
  if(!ok) return;
  try{
    setStatus('prospectStatus', 'Eliminazione prospetto in corso...', 'info');
    const res = await apiFetch(`${PROSPECTS_PATH}/${encodeURIComponent(slugTrim)}`, { method: 'DELETE' });
    if(res.status === 404){
      await loadProperty(currentSlug);
      setStatus('prospectStatus', 'Il prospetto era già stato eliminato.', 'success');
      return;
    }
    if(!res.ok){
      const txt = await res.text();
      throw new Error(txt || `Status ${res.status}`);
    }
    await loadProperty(currentSlug);
    setStatus('prospectStatus', 'Prospetto eliminato correttamente.', 'success');
  }catch(err){
    console.error(err);
    const message = (err && err.message) ? err.message : 'Errore durante l\'eliminazione del prospetto.';
    setStatus('prospectStatus', message, 'error');
  }
};

const loadProperty = async slug => {
  if(!slug){
    currentSlug = '';
    currentProperty = null;
    fillForm(null);
    renderProspects([]);
    setStatus('propertyStatus', '', 'info');
    setStatus('prospectStatus', '', 'info');
    return;
  }
  try{
    setStatus('propertyStatus', 'Caricamento proprieta...', 'info');
  const res = await apiFetch(`${PROPERTIES_PATH}/${encodeURIComponent(slug)}`);
    if(!res.ok){
      throw new Error(`Status ${res.status}`);
    }
    const data = await res.json();
    currentSlug = data.slug;
    currentProperty = data;
    fillForm(data);
    renderProspects(data.prospects || []);
    setStatus('propertyStatus', 'Proprieta caricata.', 'success');
    setStatus('prospectStatus', (data.prospects?.length || 0) ? '' : 'Nessun prospetto collegato.', 'info');
    $('newProspectBtn').disabled = false;
  }catch(err){
    console.error(err);
    setStatus('propertyStatus', 'Proprieta non trovata.', 'error');
    currentSlug = '';
    currentProperty = null;
    fillForm(null);
    renderProspects([]);
  }
};

const collectPayload = () => ({
  slug: $('propertySlug').value,
  nome: $('propertyName').value,
  indirizzo: $('propertyAddress').value,
  citta: $('propertyCity').value,
  ownerNome: $('ownerName').value,
  ownerEmail: $('ownerEmail').value,
  ownerTelefono: $('ownerPhone').value,
  note: $('propertyNote').value,
});

const saveProperty = async () => {
  const payload = collectPayload();
  if(!payload.nome && !payload.slug){
    setStatus('propertyStatus', 'Inserisci almeno il nome della proprieta.', 'error');
    return;
  }
  payload.slug = slugify(payload.slug || payload.nome);
  if(!payload.slug){
    setStatus('propertyStatus', 'Slug non valido.', 'error');
    return;
  }
  payload.slug = await ensureUniqueSlug(payload.slug, currentSlug);
  $('propertySlug').value = payload.slug;
  try{
    setStatus('propertyStatus', 'Salvataggio in corso...', 'info');
  const res = await apiFetch(PROPERTIES_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if(!res.ok){
      let payloadErr;
      try{
        payloadErr = await res.json();
      }catch(parseErr){
        const txt = await res.text();
        payloadErr = { error: txt || `Status ${res.status}` };
      }
      const message = payloadErr?.error || payloadErr?.message || `Status ${res.status}`;
      throw new Error(message);
    }
    const saved = await res.json();
    currentSlug = saved.slug;
    currentProperty = saved;
    fillForm(saved);
    setStatus('propertyStatus', 'Proprieta salvata correttamente.', 'success');
    $('newProspectBtn').disabled = false;
    $('deletePropertyBtn').disabled = false;
    $('newProspectBtn').dataset.slug = saved.slug;
    $('deletePropertyBtn').dataset.slug = saved.slug;
    const url = new URL(window.location.href);
    url.searchParams.set('slug', saved.slug);
    window.history.replaceState({}, '', url.toString());
    await loadProperty(saved.slug);
  }catch(err){
    console.error(err);
    setStatus('propertyStatus', `Errore durante il salvataggio: ${err?.message || 'richiesta non riuscita'}.`, 'error');
  }
};

const deleteProperty = async () => {
  if(!currentSlug){
    setStatus('propertyStatus', 'Nessuna proprieta da eliminare.', 'error');
    return;
  }
  const prospectCount = Array.isArray(currentProperty?.prospects) ? currentProperty.prospects.length : 0;
  const extraWarning = prospectCount > 0
    ? `\n\nAttenzione: ${prospectCount === 1 ? '1 prospetto' : `${prospectCount} prospetti`} collegati verranno spostati nella sezione "Prospetti senza proprieta".`
    : '';
  const ok = window.confirm(`Eliminare la proprieta "${currentSlug}"? L'operazione non puo essere annullata.${extraWarning}`);
  if(!ok) return;
  try{
    setStatus('propertyStatus', 'Eliminazione in corso...', 'info');
    const res = await apiFetch(`${PROPERTIES_PATH}/${encodeURIComponent(currentSlug)}`, { method: 'DELETE' });
    if(res.status === 404){
      setStatus('propertyStatus', 'Proprieta già rimossa.', 'success');
      setTimeout(() => {
        window.location.href = appendApiToHref('../archivio/index.html');
      }, 500);
      return;
    }
    if(!res.ok){
      const raw = await res.text();
      let message = raw || `Status ${res.status}`;
      try{
        const payload = raw ? JSON.parse(raw) : null;
        if(payload && typeof payload === 'object'){
          message = payload.error || payload.message || message;
        }
      }catch(parseErr){ /* ignore */ }
      throw new Error(message);
    }
    const result = await res.json().catch(() => ({ success: true }));
    const detached = Number.isFinite(+result?.detachedProspects) ? +result.detachedProspects : 0;
    const extra = detached > 0 ? ` ${detached === 1 ? '1 prospetto spostato' : `${detached} prospetti spostati`} nella sezione senza proprieta.` : '';
    setStatus('propertyStatus', `Proprieta eliminata.${extra}`, 'success');
    setTimeout(() => {
      window.location.href = appendApiToHref('../archivio/index.html');
    }, 700);
  }catch(err){
    console.error(err);
    const message = (err && err.message) ? err.message : 'Impossibile eliminare la proprieta.';
    setStatus('propertyStatus', message, 'error');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  currentSlug = params.get('slug') || '';

  $('autoSlugBtn')?.addEventListener('click', async () => {
    const name = $('propertyName').value;
    let slug = slugify(name);
    slug = await ensureUniqueSlug(slug, currentSlug);
    $('propertySlug').value = slug;
  });

  $('savePropertyBtn')?.addEventListener('click', saveProperty);

  $('newProspectBtn')?.addEventListener('click', () => {
    if(!currentSlug) return;
    const url = appendApiToHref(`../../index.html?property=${encodeURIComponent(currentSlug)}`);
    window.open(url, '_blank');
  });

  $('deletePropertyBtn')?.addEventListener('click', deleteProperty);

  $('propertyProspects')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="delete-prospect"]');
    if(btn){
      handleProspectDelete(btn.dataset.slug);
    }
  });

  applyApiToLinks();
  loadProperty(currentSlug);
});
