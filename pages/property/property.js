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

// Prefer an explicitly set global, otherwise detect production vs local like the main script
const DEFAULT_PROD_API = 'https://calcolatore-prospetti.onrender.com';
const LOCAL_API = 'http://localhost:3001';
const API_BASE_URL = (
  window.CALCOLATORE_API ||
  (['https://calcolatore-prospetti.onrender.com'].includes(location.hostname) || location.protocol === 'file:' ? LOCAL_API : DEFAULT_PROD_API)
).replace(/\/$/, '');
const PROPERTIES_ENDPOINT = `${API_BASE_URL}/api/properties`;
const PROSPECTS_ENDPOINT = `${API_BASE_URL}/api/prospetti`;

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
    const res = await fetch(`${PROPERTIES_ENDPOINT}/${encodeURIComponent(slug)}`);
    if(res.status === 404) return null;
    if(!res.ok) throw new Error(`Status ${res.status}`);
    return await res.json();
  }catch(err){
    console.error('Errore recupero proprieta', err);
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
    const existing = await getProperty(slug);
    if(!existing) return slug;
    if(originalSlug && existing.slug === originalSlug) return slug;
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
    return;
  }

  const cards = items.map(item => {
    const title = escapeHtml(item.titolo || item.indirizzo1 || item.slug);
    const slugEsc = escapeHtml(item.slug);
    const slugEnc = encodeURIComponent(item.slug);
    const indirizzo = [item.indirizzo1, item.indirizzo2].filter(Boolean).join(' - ');
    const indirizzoHtml = escapeHtml(indirizzo);
    const updated = fmtDate(item.updatedAt);
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
          <a class="btn" href="../../index.html?slug=${slugEnc}&apply=1" target="_blank" rel="noopener">Apri nel calcolatore</a>
          <a class="btn btn-secondary" href="../../index.html?slug=${slugEnc}&apply=1&print=1" target="_blank" rel="noopener">Apri e stampa</a>
          <button class="btn btn-danger" type="button" data-action="delete-prospect" data-slug="${slugEsc}">Elimina</button>
        </div>
      </article>
    `;
  });

  container.innerHTML = cards.join('');
};

const handleProspectDelete = async slug => {
  const slugTrim = (slug || '').trim();
  if(!slugTrim) return;
  const ok = window.confirm(`Eliminare il prospetto "${slugTrim}"? L'operazione non puo essere annullata.`);
  if(!ok) return;
  try{
    setStatus('prospectStatus', 'Eliminazione prospetto in corso...', 'info');
    const res = await fetch(`${PROSPECTS_ENDPOINT}/${encodeURIComponent(slugTrim)}`, { method: 'DELETE' });
    if(!res.ok){
      const txt = await res.text();
      throw new Error(txt || `Status ${res.status}`);
    }
    await loadProperty(currentSlug);
    setStatus('prospectStatus', 'Prospetto eliminato correttamente.', 'success');
  }catch(err){
    console.error(err);
    setStatus('prospectStatus', 'Errore durante l\'eliminazione del prospetto.', 'error');
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
    const res = await fetch(`${PROPERTIES_ENDPOINT}/${encodeURIComponent(slug)}`);
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
    const res = await fetch(PROPERTIES_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if(!res.ok){
      const txt = await res.text();
      throw new Error(txt || `Status ${res.status}`);
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
    setStatus('propertyStatus', 'Errore durante il salvataggio.', 'error');
  }
};

const deleteProperty = async () => {
  if(!currentSlug){
    setStatus('propertyStatus', 'Nessuna proprieta da eliminare.', 'error');
    return;
  }
  const ok = window.confirm(`Eliminare la proprieta "${currentSlug}"? L'operazione non puo essere annullata.`);
  if(!ok) return;
  try{
    setStatus('propertyStatus', 'Eliminazione in corso...', 'info');
    const res = await fetch(`${PROPERTIES_ENDPOINT}/${encodeURIComponent(currentSlug)}`, { method: 'DELETE' });
    if(!res.ok){
      const txt = await res.text();
      throw new Error(txt || `Status ${res.status}`);
    }
    setStatus('propertyStatus', 'Proprieta eliminata.', 'success');
    setTimeout(() => {
      window.location.href = '../archivio/index.html';
    }, 600);
  }catch(err){
    console.error(err);
    setStatus('propertyStatus', 'Impossibile eliminare la proprieta. Verifica che non abbia prospetti collegati.', 'error');
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
    const url = `../../index.html?property=${encodeURIComponent(currentSlug)}`;
    window.open(url, '_blank');
  });

  $('deletePropertyBtn')?.addEventListener('click', deleteProperty);

  $('propertyProspects')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="delete-prospect"]');
    if(btn){
      handleProspectDelete(btn.dataset.slug);
    }
  });

  loadProperty(currentSlug);
});
