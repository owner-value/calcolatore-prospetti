const API_BASE_URL = (window.CALCOLATORE_API || 'http://localhost:3001').replace(/\/$/, '');
const PROPERTIES_ENDPOINT = `${API_BASE_URL}/api/properties`;
const PROSPECTS_ENDPOINT = `${API_BASE_URL}/api/prospetti`;

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
        <a class="btn" href="../../index.html?slug=${slugEnc}&apply=1" target="_blank" rel="noopener">Apri nel calcolatore</a>
        <a class="btn btn-secondary" href="../../index.html?slug=${slugEnc}&apply=1&print=1" target="_blank" rel="noopener">Apri e stampa</a>
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
    return;
  }

  if(!propertySlug){
    const filtered = filterBySearch(prospects);
    html = filtered.length ? filtered.map(item => buildProspectCard(item)).join('') : `<div class="archive-empty">Nessun prospetto corrisponde alla ricerca "${escapeHtml(searchTerm.trim())}".</div>`;
    list.innerHTML = html;
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
    const propertyLink = `../property/index.html?slug=${encodeURIComponent(item.slug)}`;
    const createLink = `../../index.html?property=${encodeURIComponent(item.slug)}&prefill=${encodeURIComponent(JSON.stringify({indirizzoRiga1: item.indirizzo || '', indirizzoRiga2: item.citta || ''}))}`;
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
          <button class="btn btn-danger" type="button" data-action="delete-property" data-slug="${escapeHtml(item.slug)}"${count ? ' disabled' : ''}>Elimina</button>
        </div>
      </article>
    `;
  });

  container.innerHTML = cards.join('');
};

const fetchProperties = async () => {
  try{
    setStatus('propertyStatus', 'Caricamento proprieta...', 'info');
    const res = await fetch(PROPERTIES_ENDPOINT);
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
    const res = await fetch(PROSPECTS_ENDPOINT);
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
    const res = await fetch(`${PROSPECTS_ENDPOINT}/${encodeURIComponent(slugTrim)}`, { method: 'DELETE' });
    if(!res.ok){
      const txt = await res.text();
      throw new Error(txt || `Status ${res.status}`);
    }
    await fetchProspects();
    await fetchProperties();
    setStatus('archiveStatus', 'Prospetto eliminato correttamente.', 'success');
  }catch(err){
    console.error(err);
    setStatus('archiveStatus', 'Errore durante l\'eliminazione del prospetto.', 'error');
  }
};

const handlePropertyDelete = async slug => {
  const slugTrim = (slug || '').trim();
  if(!slugTrim) return;
  const ok = window.confirm(`Eliminare la proprieta "${slugTrim}"? L'operazione non puo essere annullata.`);
  if(!ok) return;

  try{
    setStatus('propertyStatus', 'Eliminazione proprieta in corso...', 'info');
    const res = await fetch(`${PROPERTIES_ENDPOINT}/${encodeURIComponent(slugTrim)}`, { method: 'DELETE' });
    if(!res.ok){
      const txt = await res.text();
      throw new Error(txt || `Status ${res.status}`);
    }
    if(selectedProperty === slugTrim){
      selectedProperty = '';
    }
    await fetchProperties();
    await fetchProspects();
    setStatus('propertyStatus', 'Proprieta eliminata correttamente.', 'success');
  }catch(err){
    console.error(err);
    setStatus('propertyStatus', 'Impossibile eliminare la proprieta. Verifica che non abbia prospetti associati.', 'error');
  }
};

const handleProspectAssign = async (slug, propertySlug) => {
  const slugTrim = (slug || '').trim();
  if(!slugTrim) return;
  try{
    setStatus('archiveStatus', 'Aggiornamento in corso...', 'info');
    const res = await fetch(`${PROSPECTS_ENDPOINT}/${encodeURIComponent(slugTrim)}`, {
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
    const url = slug ? `../property/index.html?slug=${encodeURIComponent(slug)}` : '../property/index.html';
    window.open(url, '_blank');
  });

  $('propertyList')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="delete-property"]');
    if(btn && !btn.disabled){
      handlePropertyDelete(btn.dataset.slug);
    }
  });

  $('prospectList')?.addEventListener('click', e => {
    const deleteBtn = e.target.closest('[data-action="delete-prospect"]');
    if(deleteBtn){
      handleProspectDelete(deleteBtn.dataset.slug);
      return;
    }
    const assignBtn = e.target.closest('[data-action="assign-property"]');
    if(assignBtn){
      const card = assignBtn.closest('.prospect-card');
      const select = card?.querySelector('[data-role="assign-select"]');
      const value = select ? select.value : '';
      handleProspectAssign(assignBtn.dataset.slug, value);
      return;
    }
    const quickBtn = e.target.closest('[data-action="assign-quick"]');
    if(quickBtn){
      handleProspectAssign(quickBtn.dataset.slug, quickBtn.dataset.property || '');
    }
  });

  const params = new URLSearchParams(window.location.search);
  selectedProperty = params.get('property') || '';

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
