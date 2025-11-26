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

let properties = [];
let prospects = [];
let selectedProperty = '';
let searchTerm = '';

const normalize = value => {
  if(!value) return '';
  return value.toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

const fmtDate = iso => {
  if(!iso) return '--';
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return '--';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
};

const escapeHtml = (value = '') => {
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

const getPropertyName = slug => {
  if(!slug) return '';
  const match = properties.find(p => p.slug === slug);
  return match?.nome || match?.slug || slug;
};

const buildPropertySelect = (currentSlug = '') => {
  const options = ['<option value="">Nessuna proprieta</option>'];
  properties.forEach(prop => {
    const selected = prop.slug === currentSlug ? ' selected' : '';
    options.push(`<option value="${escapeHtml(prop.slug)}"${selected}>${escapeHtml(prop.nome || prop.slug)}</option>`);
  });
  return options.join('');
};

const buildProspectCard = (item, opts = {}) => {
  const title = escapeHtml(item.titolo || item.indirizzo1 || item.slug);
  const slugEsc = escapeHtml(item.slug);
  const slugEnc = encodeURIComponent(item.slug);
  const indirizzo = [item.indirizzo1, item.indirizzo2].filter(Boolean).join(' - ');
  const indirizzoHtml = escapeHtml(indirizzo);
  const updated = fmtDate(item.updatedAt);
  const calcUrl = appendApiToHref(`../../index.html?slug=${slugEnc}&apply=1`);
  const printUrl = appendApiToHref(`../../index.html?slug=${slugEnc}&apply=1&print=1`);
  const propertyLabel = item.property?.nome || item.property?.slug || 'Nessuna proprieta';
  const propertyHtml = escapeHtml(propertyLabel);
  const currentPropertySlug = item.property?.slug || '';
  const selectHtml = buildPropertySelect(currentPropertySlug);
  const quickAssignSlug = opts.quickAssignSlug || '';
  const quickAssignName = quickAssignSlug ? escapeHtml(getPropertyName(quickAssignSlug) || quickAssignSlug) : '';
  const quickAssignButton = quickAssignSlug ? `<button class="btn" type="button" data-action="assign-quick" data-slug="${slugEsc}" data-property="${escapeHtml(quickAssignSlug)}">Assegna a ${quickAssignName}</button>` : '';

  return `
    <article class="prospect-card" data-slug="${slugEsc}">
      <header>
        <h3>${title}</h3>
        <span class="slug-chip">${slugEsc}</span>
      </header>
      <div class="prospect-meta">
        <div>
          <span class="label">Proprieta</span>
          <span>${propertyHtml}</span>
        </div>
        <div>
          <span class="label">Indirizzo</span>
          <span>${indirizzoHtml || '--'}</span>
        </div>
        <div>
          <span class="label">Aggiornato</span>
          <span>${updated}</span>
        </div>
      </div>
      <div class="prospect-assign">
        <label for="assign-${slugEsc}">Associa a proprieta</label>
        <div class="assign-row">
          <select data-role="assign-select" id="assign-${slugEsc}">
            ${selectHtml}
          </select>
          <button class="btn btn-secondary" type="button" data-action="assign-property" data-slug="${slugEsc}">Aggiorna</button>
          ${quickAssignButton}
        </div>
      </div>
      <div class="prospect-actions">
        <a class="btn" href="${calcUrl}" target="_blank" rel="noopener">Apri nel calcolatore</a>
        <a class="btn btn-secondary" href="${printUrl}" target="_blank" rel="noopener">Apri e stampa</a>
        <button class="btn btn-danger" type="button" data-action="delete-prospect" data-slug="${slugEsc}">Elimina</button>
      </div>
    </article>
  `;
};

const filterBySearch = items => {
  const term = normalize(searchTerm);
  if(!term) return items.slice();
  return items.filter(item => {
    const haystack = [
      normalize(item.titolo),
      normalize(item.indirizzo1),
      normalize(item.indirizzo2),
      normalize(item.slug),
      normalize(item.property?.nome),
      normalize(item.property?.slug),
    ].join(' ');
    return haystack.includes(term);
  });
};

const applyProspectFilter = () => {
  const list = $('prospectList');
  if(!list) return;
  const term = normalize(searchTerm);
  const propertySlug = selectedProperty;
  let html = '';

  if(!prospects.length){
    list.innerHTML = '<div class="archive-empty">Nessun prospetto salvato.</div>';
    applyApiToLinks(list);
    return;
  }

  if(!propertySlug){
    const filtered = filterBySearch(prospects);
    html = filtered.length ? filtered.map(item => buildProspectCard(item)).join('') : `<div class="archive-empty">Nessun prospetto corrisponde alla ricerca "${escapeHtml(searchTerm.trim())}".</div>`;
    list.innerHTML = html;
    applyApiToLinks(list);
    return;
  }

  const assigned = filterBySearch(prospects.filter(item => item.property?.slug === propertySlug));
  const unassigned = filterBySearch(prospects.filter(item => !item.property?.slug));
  const propertyName = escapeHtml(getPropertyName(propertySlug) || propertySlug);

  html += `<h3 class="list-title">Prospetti per ${propertyName}</h3>`;
  html += assigned.length
    ? assigned.map(item => buildProspectCard(item, { quickAssignSlug: propertySlug })).join('')
    : `<div class="archive-empty">Nessun prospetto assegnato a ${propertyName}.</div>`;

  html += '<h3 class="list-title">Prospetti senza proprieta</h3>';
  html += unassigned.length
    ? unassigned.map(item => buildProspectCard(item, { quickAssignSlug: propertySlug })).join('')
    : '<div class="archive-empty">Nessun prospetto non assegnato.</div>';

  list.innerHTML = html;
  applyApiToLinks(list);
};

const renderProperties = () => {
  const container = $('propertyList');
  if(!container) return;
  if(!properties.length){
    container.innerHTML = '<div class="archive-empty">Nessuna proprieta salvata.</div>';
    return;
  }

  const list = selectedProperty
    ? properties.filter(item => item.slug === selectedProperty)
    : properties;

  if(list.length === 0){
    const message = selectedProperty
      ? `La proprieta "${escapeHtml(getPropertyName(selectedProperty) || selectedProperty)}" non esiste.`
      : 'Nessuna proprieta salvata.';
    container.innerHTML = `<div class="archive-empty">${message}</div>`;
    return;
  }

  const cards = list.map(item => {
    const title = escapeHtml(item.nome || item.slug);
    const indirizzoParts = [item.indirizzo, item.citta].filter(Boolean);
    const indirizzo = indirizzoParts.length ? escapeHtml(indirizzoParts.join(', ')) : 'Indirizzo non impostato';
    const ownerParts = [item.ownerNome, item.ownerEmail, item.ownerTelefono].filter(Boolean);
    const owner = ownerParts.length ? escapeHtml(ownerParts.join(' - ')) : 'Nessun dato proprietario';
    const count = item._count?.prospects || 0;
    const propertyLink = appendApiToHref(`../property/index.html?slug=${encodeURIComponent(item.slug)}`);
    const createLink = appendApiToHref(`../../index.html?property=${encodeURIComponent(item.slug)}&prefill=${encodeURIComponent(JSON.stringify({indirizzoRiga1: item.indirizzo || '', indirizzoRiga2: item.citta || ''}))}`);
    return `
      <article class="property-card" data-slug="${escapeHtml(item.slug)}">
        <header>
          <h3>${title}</h3>
          <span class="slug-chip">${escapeHtml(item.slug)}</span>
        </header>
        <div class="property-meta">
          <span>${indirizzo}</span>
          <span>${owner}</span>
          <span>${count === 1 ? '1 prospetto' : count + ' prospetti'}</span>
        </div>
        <div class="property-actions">
          <a class="btn" href="${propertyLink}" target="_blank" rel="noopener">Apri scheda</a>
          <a class="btn btn-secondary" href="${createLink}" target="_blank" rel="noopener">Crea prospetto</a>
          <button class="btn btn-danger" type="button" data-action="delete-property" data-slug="${escapeHtml(item.slug)}" data-prospect-count="${count}">Elimina</button>
        </div>
      </article>
    `;
  });

  container.innerHTML = cards.join('');
  applyApiToLinks(container);
};

const fetchProperties = async () => {
  try{
    setStatus('propertyStatus', 'Caricamento proprieta...', 'info');
  const res = await apiFetch(PROPERTIES_PATH);
    if(!res.ok) throw new Error(`Status ${res.status}`);
    properties = await res.json();
    renderProperties();
    if(selectedProperty){
      const name = getPropertyName(selectedProperty) || selectedProperty;
      const exists = properties.some(item => item.slug === selectedProperty);
      setStatus('propertyStatus', exists ? `Proprieta selezionata: ${name}.` : `La proprieta ${name} non esiste piu.`, 'info');
    }else{
      setStatus('propertyStatus', properties.length ? `Proprieta totali: ${properties.length}.` : 'Nessuna proprieta registrata.', 'info');
    }

    const select = $('propertyFilter');
    if(select){
      const current = select.value;
      select.innerHTML = '<option value="">Tutte le proprieta</option>' + properties.map(item => {
        const label = escapeHtml(item.nome || item.slug);
        const sel = item.slug === selectedProperty ? ' selected' : '';
        return `<option value="${escapeHtml(item.slug)}"${sel}>${label}</option>`;
      }).join('');
      if(current && !properties.some(item => item.slug === current)){
        selectedProperty = '';
      }
      if(selectedProperty){
        select.value = selectedProperty;
      }
    }
  }catch(err){
    console.error(err);
    setStatus('propertyStatus', 'Errore nel recupero delle proprieta.', 'error');
  }
};

const fetchProspects = async () => {
  try{
    setStatus('archiveStatus', 'Caricamento prospetti...', 'info');
  const res = await apiFetch(PROSPECTS_PATH);
    if(!res.ok) throw new Error(`Status ${res.status}`);
    prospects = await res.json();
    applyProspectFilter();
    if(selectedProperty){
      const assignedCount = prospects.filter(item => item.property?.slug === selectedProperty).length;
      const propertyName = getPropertyName(selectedProperty) || selectedProperty;
      setStatus('archiveStatus', assignedCount ? `Prospetti per ${propertyName}: ${assignedCount}.` : `Nessun prospetto assegnato a ${propertyName}.`, 'info');
    }else{
      setStatus('archiveStatus', prospects.length ? `Trovati ${prospects.length} prospetti salvati.` : 'Nessun prospetto salvato.', 'info');
    }
  }catch(err){
    console.error(err);
    prospects = [];
    applyProspectFilter();
    setStatus('archiveStatus', 'Errore nel recupero dei prospetti.', 'error');
  }
};

const handleProspectDelete = async slug => {
  const slugTrim = (slug || '').trim();
  if(!slugTrim) return;
  const ok = window.confirm(`Eliminare il prospetto "${slugTrim}"? L'operazione non puo essere annullata.`);
  if(!ok) return;

  try{
    setStatus('archiveStatus', 'Eliminazione prospetto in corso...', 'info');
    const res = await apiFetch(`${PROSPECTS_PATH}/${encodeURIComponent(slugTrim)}`, { method: 'DELETE' });
    if(res.status === 404){
      await fetchProspects();
      await fetchProperties();
      setStatus('archiveStatus', 'Il prospetto era già stato eliminato.', 'success');
      return;
    }
    if(!res.ok){
      const txt = await res.text();
      throw new Error(txt || `Status ${res.status}`);
    }
    await fetchProspects();
    await fetchProperties();
    setStatus('archiveStatus', 'Prospetto eliminato correttamente.', 'success');
  }catch(err){
    console.error(err);
    const message = (err && err.message) ? err.message : 'Errore durante l\'eliminazione del prospetto.';
    setStatus('archiveStatus', message, 'error');
  }
};

const handlePropertyDelete = async (slug, prospectCount = 0) => {
  const slugTrim = (slug || '').trim();
  if(!slugTrim) return;
  const count = Number.isFinite(+prospectCount) ? +prospectCount : 0;
  const prospectsNote = count > 0
    ? `\n\nAttenzione: ${count === 1 ? '1 prospetto' : count + ' prospetti'} collegati verranno spostati nella sezione "Prospetti senza proprieta".`
    : '';
  const ok = window.confirm(`Eliminare la proprieta "${slugTrim}"? L'operazione non puo essere annullata.${prospectsNote}`);
  if(!ok) return;

  try{
    setStatus('propertyStatus', 'Eliminazione proprieta in corso...', 'info');
    const res = await apiFetch(`${PROPERTIES_PATH}/${encodeURIComponent(slugTrim)}`, { method: 'DELETE' });
    if(res.status === 404){
      if(selectedProperty === slugTrim){
        selectedProperty = '';
      }
      await fetchProperties();
      await fetchProspects();
      setStatus('propertyStatus', 'La proprieta era già stata rimossa.', 'success');
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
      }catch(parseErr){ /* ignore parse errors */ }
      throw new Error(message);
    }
    const result = await res.json().catch(() => ({ success: true }));
    if(selectedProperty === slugTrim){
      selectedProperty = '';
    }
    await fetchProperties();
    await fetchProspects();
    const detached = Number.isFinite(+result?.detachedProspects) ? +result.detachedProspects : 0;
    const extra = detached > 0 ? ` ${detached === 1 ? '1 prospetto spostato' : `${detached} prospetti spostati`} nella sezione senza proprieta.` : '';
    setStatus('propertyStatus', `Proprieta eliminata correttamente.${extra}`, 'success');
  }catch(err){
    console.error(err);
    const message = (err && err.message) ? err.message : 'Eliminazione non riuscita.';
    setStatus('propertyStatus', message, 'error');
  }
};

const handleProspectAssign = async (slug, propertySlug) => {
  const slugTrim = (slug || '').trim();
  if(!slugTrim) return;
  try{
    setStatus('archiveStatus', 'Aggiornamento in corso...', 'info');
  const res = await apiFetch(`${PROSPECTS_PATH}/${encodeURIComponent(slugTrim)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertySlug }),
    });
    if(!res.ok){
      const txt = await res.text();
      throw new Error(txt || `Status ${res.status}`);
    }
    await fetchProspects();
    await fetchProperties();
    setStatus('archiveStatus', 'Prospetto aggiornato correttamente.', 'success');
  }catch(err){
    console.error(err);
    setStatus('archiveStatus', 'Errore durante l\'aggiornamento del prospetto.', 'error');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  $('propertyFilter')?.addEventListener('change', e => {
    selectedProperty = e.target.value || '';
    renderProperties();
    applyProspectFilter();
    fetchProspects();
  });

  $('prospectSearch')?.addEventListener('input', e => {
    searchTerm = e.target.value || '';
    applyProspectFilter();
  });

  $('refreshArchiveBtn')?.addEventListener('click', () => {
    fetchProperties();
    fetchProspects();
  });

  $('openPropertyBtn')?.addEventListener('click', () => {
    const slug = $('propertyFilter')?.value || '';
    const url = slug
      ? appendApiToHref(`../property/index.html?slug=${encodeURIComponent(slug)}`)
      : appendApiToHref('../property/index.html');
    window.open(url, '_blank');
  });

  const onDeletePropertyClick = e => {
    const btn = e.target.closest('[data-action="delete-property"]');
    if(!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const count = parseInt(btn.dataset.prospectCount || '0', 10) || 0;
    const slug = (btn.dataset.slug || '').trim();
    if(!slug){
      setStatus('propertyStatus', 'Slug non trovato per la proprieta da eliminare.', 'error');
      return;
    }
    console.log('[archive] delete property click', slug);
    setStatus('propertyStatus', `Eliminazione di "${slug}" in corso...`, 'info');
    handlePropertyDelete(slug, count);
  };

  $('propertyList')?.addEventListener('click', onDeletePropertyClick);
  // Fallback globale nel caso il listener specifico non si leghi (markup cambiato)
  document.addEventListener('click', onDeletePropertyClick);

  const onProspectClick = e => {
    const deleteBtn = e.target.closest('[data-action="delete-prospect"]');
    if(deleteBtn){
      e.preventDefault();
      e.stopPropagation();
      const slug = (deleteBtn.dataset.slug || '').trim();
      if(!slug){
        setStatus('archiveStatus', 'Slug non trovato per il prospetto da eliminare.', 'error');
        return;
      }
      console.log('[archive] delete prospect click', slug);
      setStatus('archiveStatus', `Eliminazione del prospetto "${slug}" in corso...`, 'info');
      handleProspectDelete(slug);
      return;
    }
    const assignBtn = e.target.closest('[data-action="assign-property"]');
    if(assignBtn){
      e.preventDefault();
      const card = assignBtn.closest('.prospect-card');
      const select = card?.querySelector('[data-role="assign-select"]');
      const value = select ? select.value : '';
      handleProspectAssign(assignBtn.dataset.slug, value);
      return;
    }
    const quickBtn = e.target.closest('[data-action="assign-quick"]');
    if(quickBtn){
      e.preventDefault();
      handleProspectAssign(quickBtn.dataset.slug, quickBtn.dataset.property || '');
    }
  };

  $('prospectList')?.addEventListener('click', onProspectClick);
  // Fallback globale se il listener locale non si aggancia
  document.addEventListener('click', onProspectClick);

  const params = new URLSearchParams(window.location.search);
  selectedProperty = params.get('property') || '';

  applyApiToLinks();

  fetchProperties().then(() => {
    if(selectedProperty){
      const select = $('propertyFilter');
      if(select){
        select.value = selectedProperty;
      }
    }
    fetchProspects();
  });
});
