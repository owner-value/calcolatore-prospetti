(() => {
  // helpers locali
  const $ = id => document.getElementById(id);
  const eur = n => (new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0})).format(+n||0);
  const pct = n => `${Math.round(+n||0)}%`;

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
    if($('p6-ua'))      $('p6-ua').textContent      = eur(m?.spese?.utenzeAmm ?? 0);
    if($('p6-ota'))     $('p6-ota').textContent     = eur(m?.spese?.ota ?? 0);
    if($('p6-kit'))     $('p6-kit').textContent     = eur(m?.spese?.kit ?? 0);
    if($('p6-pm'))      $('p6-pm').textContent      = eur(m?.spese?.pm ?? 0);
    if($('p6-una'))     $('p6-una').textContent     = eur(m?.spese?.unaTantum ?? 0);

    if($('p7-utile-lordo'))   $('p7-utile-lordo').textContent   = eur(m?.risultati?.utileLordo ?? 0);
    if($('p7-utile-netto'))   $('p7-utile-netto').textContent   = eur(m?.risultati?.utileNetto ?? 0);
    if($('p7-mensile-netto')) $('p7-mensile-netto').textContent = eur(m?.risultati?.mensileNetto ?? 0);
  }

  function loadAndRender(){
    try{
      const raw = localStorage.getItem('ownervalue:model');
      if(!raw) return;
      render(JSON.parse(raw));
    }catch(e){ console.error('Report: model non valido', e); }
  }

  document.addEventListener('DOMContentLoaded', loadAndRender);
  window.addEventListener('storage', loadAndRender);
})();