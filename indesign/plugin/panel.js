// moodbook · panneau InDesign : interface et horloge de synchronisation
(function () {
  'use strict';
  const uxp = require('uxp');
  const ID = require('indesign');
  // Connexion gardée d'une version du panneau à l'autre : une réinstallation efface le stockage du panneau, alors la
  // session et l'adresse sont aussi rangées dans les préférences d'InDesign (étiquettes de l'application)
  const KEEP = /^mb-(session|email)$/;
  const appGet = k => { try { return ID.app.extractLabel(k) || null; } catch (e) { return null; } };
  const appSet = (k, v) => { try { ID.app.insertLabel(k, v == null ? '' : String(v)); } catch (e) { /* not available */ } };
  const store = {
    getItem(k) { let v = null; try { v = window.localStorage.getItem(k); } catch (e) { /* none */ }
      if ((v == null || v === 'null') && KEEP.test(k)) { const a = appGet(k); if (a) { v = a; try { window.localStorage.setItem(k, a); } catch (e) { /* none */ } } }
      return v; },
    setItem(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* none */ } if (KEEP.test(k)) appSet(k, v); },
    removeItem(k) { try { window.localStorage.removeItem(k); } catch (e) { /* none */ } if (KEEP.test(k)) appSet(k, ''); }
  };
  const api = MBApi.makeApi(window.CDF_CONFIG, store);
  const dom = MBDom.makeDom(ID, uxp);
  const ui = { books: null, docs: [], bookSel: '', role: '', progress: '', err: '', email: store.getItem('mb-email') || '', showWaiting: false, showDone: false, forDoc: '',
    tab: 'sync', menu: false, seenLog: 0, nb: null };
  const engine = new MBEngine.Engine({ api, dom, store, onChange: () => render() });
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const time = t => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const plain = d => d && d.paras ? d.paras.map(p => (p.runs || []).map(r => r.t).join('')).join('\n') : (d && d.p ? d.p.split('/').pop() : '(vide)');
  const ROLE = { mep: 'fichier de conception (MEP)', livre: 'fichier livre' };
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const bookKey = b => b.owner + '|' + b.id;
  const docsOf = b => ui.docs.filter(d => d.owner === b.owner && d.book_id === b.id);
  const NEW = '__new__';
  const isIncident = m => /impossible|erreur|refus|illisible|introuvable|conflit|non envoy/i.test(m);
  const incidents = () => engine.log.filter(l => isIncident(l.msg));
  const I = {
    sync: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M13 6.5A5 5 0 0 0 4 4.2L2.8 5.5M3 9.5a5 5 0 0 0 9 2.3l1.2-1.3M2.8 2.5v3h3M13.2 13.5v-3h-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ok: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    live: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="3.5" fill="currentColor"/></svg>',
    warn: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M8 2 14.5 13.5h-13L8 2Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.5v3.2M8 11.6v.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    more: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="3.5" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="12.5" cy="8" r="1.3" fill="currentColor"/></svg>'
  };

  // Suggest the project and the role from the file name: « Madrid - MEP » → Madrid, conception ; « Madrid » → Madrid, livre
  function suggest(doc) {
    const name = dom.docName(doc); const isMep = /(^|[\s_-])MEP($|[\s_-])/i.test(name);
    const base = norm(name.replace(/[\s_-]*MEP[\s_-]*/i, ' '));
    const hit = (ui.books || []).find(b => norm(b.title) === base) || (ui.books || []).find(b => base && (base.includes(norm(b.title)) || norm(b.title).includes(base)));
    return { role: isMep ? 'mep' : 'livre', key: hit ? bookKey(hit) : NEW };
  }
  // A new book's proposal from the file: title without « MEP », year found in the name, pages rounded up to a multiple of 4
  function newBookDraft(doc) {
    const name = dom.docName(doc).replace(/[\s_-]*MEP[\s_-]*/i, ' ').replace(/^beeboo\s*book\s*\d*\s*-?\s*/i, '').replace(/\s+/g, ' ').trim() || dom.docName(doc);
    const y = (name.match(/\b(19|20)\d{2}\b/) || [])[0]; const n = Math.max(4, Math.ceil((dom.pageCount(doc) || 4) / 4) * 4);
    return { title: name, year: y || String(new Date().getFullYear()), pages: String(n) };
  }

  function pendingBox(doc) {
    const p = engine.pending; const t = esc(p.title || (p.book && p.book.title) || '');
    const here = `<p class="muted small">Ce fichier : ${esc(dom.docKey(doc))}</p>`;
    if (p.kind === 'copy') return `<section class="card warn"><div class="eyebrow">Fichier à vérifier</div><p><b>${esc(dom.docName(doc))}</b> est relié à <b>${t}</b> comme ${ROLE[p.role]}, mais il n'est pas à l'emplacement enregistré.</p>
      <p class="muted small">Emplacement relié : ${esc(p.reg.path)}</p>${here}<p class="muted small">Rien n'est synchronisé tant que vous n'avez pas choisi.</p>
      <button class="btn primary block" data-ch="detach">C'est une copie : la détacher</button>
      <p class="hint">La copie n'appartient plus à aucun projet ; vous pourrez la relier au bon projet juste après.</p>
      <button class="btn block" data-ch="moved">C'est le même fichier, déplacé ou renommé</button></section>`;
    if (p.kind === 'old' || p.kind === 'copy-old') return `<section class="card warn"><div class="eyebrow">Lien à confirmer</div><p><b>${esc(dom.docName(doc))}</b> a été lié à <b>${t}</b> par une ancienne version du panneau${p.kind === 'copy-old' ? ', depuis un autre emplacement : c\'est peut-être une copie' : ''}.</p>
      ${p.kind === 'copy-old' ? `<p class="muted small">Emplacement lié : ${esc(p.path)}</p>` : ''}${here}
      <button class="btn primary block" data-ch="confirm">Oui, c'est le fichier livre de « ${t} »</button>
      <p class="hint">Ce fichier devient la référence du projet ; les textes écrits sur le site y arrivent.</p>
      <button class="btn block" data-ch="detach">Non, détacher ce fichier</button></section>`;
    if (p.kind === 'taken') return `<section class="card warn"><p><b>${t}</b> a déjà un ${ROLE[p.role]} : <b>${esc(p.res.name || '?')}</b>.</p><p class="muted small">${esc(p.res.path || '')}</p>
      <button class="btn primary block" data-ch="force">Le remplacer par ce fichier</button><button class="btn block" data-ch="cancel">Annuler</button>
      ${p.role === 'livre' ? '<p class="hint">Le projet suivra alors ce fichier-ci ; l\'autre ne sera plus synchronisé.</p>' : ''}</section>`;
    if (p.kind === 'other') { const ob = (ui.books || []).find(b => b.id === p.res.book && b.owner === p.res.owner);
      return `<section class="card warn"><p>Ce fichier est déjà relié à <b>${esc(ob ? ob.title : p.res.book)}</b> comme ${ROLE[p.res.role]}.</p>
      <button class="btn primary block" data-ch="force">Le relier à « ${t} » à la place</button><button class="btn block" data-ch="cancel">Annuler</button></section>`; }
    return `<section class="card warn"><p>Liaison impossible.</p><button class="btn block" data-ch="cancel">Réessayer</button></section>`;
  }

  function linkForm(doc) {
    const books = ui.books;
    if (!books) return `<section class="card"><p class="muted">Chargement des livres…</p></section>`;
    if (ui.forDoc !== dom.docKey(doc)) { const s = suggest(doc); ui.forDoc = dom.docKey(doc); ui.role = s.role; ui.bookSel = s.key; ui.nb = newBookDraft(doc); }
    const isNew = ui.bookSel === NEW;
    const b = isNew ? null : (books.find(x => bookKey(x) === ui.bookSel) || books[0]);
    const cur = b ? docsOf(b).find(d => d.role === ui.role) : null;
    const status = bk => { const ds = docsOf(bk); const m = ds.find(d => d.role === 'mep'), l = ds.find(d => d.role === 'livre'); return [m ? 'MEP ✓' : '', l ? 'livre ✓' : '', bk.doc ? 'en création' : ''].filter(Boolean).join(' · '); };
    const nb = ui.nb || newBookDraft(doc);
    return `<section class="card"><div class="eyebrow">Fichier non relié</div><h2>${esc(dom.docName(doc))}</h2>
      <p class="muted small">Un livre = un fichier de conception (« Mon livre - MEP ») et un fichier livre (« Mon livre »).</p>
      <label class="lbl" for="bk">Livre sur le site</label>
      <select id="bk"><option value="${NEW}" ${isNew ? 'selected' : ''}>+ Nouveau livre sur le site…</option>${books.map(x => `<option value="${esc(bookKey(x))}" ${!isNew && b && bookKey(x) === bookKey(b) ? 'selected' : ''}>${esc(x.title)}${x.year ? ' (' + esc(x.year) + ')' : ''}${x.shared ? ' · partagé' : ''}${status(x) ? ' — ' + esc(status(x)) : ''}</option>`).join('')}</select>
      ${isNew ? `<div class="newbook"><p class="hint" style="margin-top:0">${suggest(doc).key === NEW ? 'Aucun livre de ce nom sur le site : il sera créé.' : ''}</p>
        <label class="lbl" for="nb-title">Titre</label><input id="nb-title" value="${esc(nb.title)}">
        <div class="row2"><div><label class="lbl" for="nb-year">Année</label><input id="nb-year" value="${esc(nb.year)}"></div><div><label class="lbl" for="nb-pages">Pages</label><input id="nb-pages" value="${esc(nb.pages)}"></div></div></div>` : ''}
      <label class="lbl">Ce fichier est</label>
      <div class="seg"><button class="${ui.role === 'mep' ? 'on' : ''}" data-role="mep">Conception (MEP)</button><button class="${ui.role === 'livre' ? 'on' : ''}" data-role="livre">Livre</button></div>
      ${cur ? `<p class="err small">« ${esc(b.title)} » a déjà un ${ROLE[ui.role]} : « ${esc(cur.name)} ». Le relier ici le remplacera.</p>` : ''}
      ${b && ui.role === 'livre' && b.doc && !cur ? `<p class="hint">« ${esc(b.title)} » est déjà en création : relier ce fichier remet le site d'accord avec lui.</p>` : ''}
      <button class="btn primary block" id="link">${isNew ? 'Créer le livre et relier ce fichier' : `Relier à « ${esc(b ? b.title : '')} »`}</button>
      ${ui.progress ? `<p class="status">${esc(ui.progress)}</p>` : ''}${ui.err ? `<p class="err small">${esc(ui.err)}</p>` : ''}</section>`;
  }

  function syncTab(doc) {
    const l = engine.link;
    const head = `<div class="eyebrow">Fichier lié · ${l.role === 'mep' ? 'conception (MEP)' : 'livre'}</div><h2>${esc(l.title)}</h2><div class="muted">${esc(dom.docName(doc))}</div>`;
    const unl = `<button class="linkbtn" id="unlink">Délier ce fichier</button>`;
    if (l.role === 'mep') return `<section class="card">${head}<p class="hint">Fichier de conception : exportez ses mises en page avec le script « Export MEP », puis glissez le dossier sur le livre (onglet Mises en page du site).</p></section>${unl}`;
    if (!engine.inCreation) return `<section class="card">${head}<p class="hint">Le livre est encore en conception sur le site. « Passer en création » envoie les pages, les blocs photo et les blocs texte de ce fichier : le site et InDesign travaillent ensuite ensemble sur ce fichier.</p></section>
      <button class="btn primary block" id="go">Passer en création</button>${ui.progress ? `<p class="status">${esc(ui.progress)}</p>` : ''}${ui.err ? `<p class="err small">${esc(ui.err)}</p>` : ''}${unl}`;
    const site = engine.others.filter(o => o.client === 'site');
    const who = site.length ? site.map(o => esc(o.name) + (o.active ? '' : ' (inactif)')).join(', ') : 'Personne';
    const state = engine.live
      ? `<div class="state live"><span class="ic">${I.live}</span><div><b>Synchronisation en direct</b><p>Vos modifications partent au fil de l'eau ; les blocs que vous touchez sont réservés pour vous.</p></div></div>`
      : `<div class="state ok"><span class="ic">${I.ok}</span><div><b>Synchronisation au calme</b><p>Vos modifications partent à l'enregistrement ; le site est vérifié toutes les 20 secondes.</p></div></div>`;
    const inc = incidents().filter(x => x.t > ui.seenLog).length;
    return `<section class="card">${head}${state}
        <div class="kv"><span>Dernière synchro</span><b>${engine.lastSync ? time(engine.lastSync) : '—'}</b></div>
        <div class="kv"><span>Sur le site</span><b>${who}</b></div></section>
      <button class="btn primary block" id="now">${I.sync} Synchroniser maintenant</button>
      <button class="btn block" id="fix">Tout resynchroniser</button>
      <p class="hint center">Remet le site d'accord avec ce document : pages, aperçus et textes. Les textes écrits sur le site sont gardés.</p>
      ${engine.conflicts.size ? `<section class="card warn"><div class="eyebrow">À réconcilier (${engine.conflicts.size})</div>
        ${engine.conflicts.size > 1 ? `<div class="row"><button class="btn sm primary" id="all-site">Tout prendre du site</button><button class="btn sm" id="all-mine">Tout garder d'InDesign</button></div>` : ''}
        <div class="scroll">${[...engine.conflicts.entries()].map(([bid, c]) => `<div class="conf"><div>${c.blk.kind === 'tx' ? 'Texte' : 'Photo'} p. ${esc(c.blk.page || '?')} modifié ici et ${c.row && c.row.src === 'site' ? 'sur le site' : 'ailleurs'}${c.row && c.row.by_name ? ' (' + esc(c.row.by_name) + ')' : ''}</div>
          <div class="muted small">InDesign :</div><pre>${esc(plain(c.blk.data))}</pre><div class="muted small">Site :</div><pre>${esc(plain(c.row && c.row.data))}</pre>
          <div class="row"><button class="btn sm" data-res="mine" data-bid="${bid}">Garder InDesign</button><button class="btn sm" data-res="site" data-bid="${bid}">Prendre le site</button>${c.blk.kind === 'tx' ? `<button class="btn sm" data-res="both" data-bid="${bid}">Les deux</button>` : ''}</div></div>`).join('')}</div></section>` : ''}
      ${engine.waiting.size ? `<section class="card"><div class="row"><b>En attente (${engine.waiting.size})</b><span class="muted small">en cours sur le site</span><button class="btn sm" id="tgw">${ui.showWaiting ? 'Masquer' : 'Voir'}</button></div>${!ui.showWaiting ? '' : `<div class="scroll">${[...engine.waiting.entries()].map(([bid, r]) => `<div class="small">${bid.charAt(0) === 's' ? 'Texte' : 'Photo'} p. ${esc(r && r.page || '?')} · ${esc(r && r.lock_name || 'quelqu\'un')}</div>`).join('')}</div>`}</section>` : ''}
      ${unl}
      ${inc ? `<button class="banner" id="go-log"><span class="ic">${I.warn}</span><span><b>${inc} incident${inc > 1 ? 's' : ''}</b><u>Voir dans le journal →</u></span></button>` : ''}`;
  }

  function notesTab() {
    const all = engine.todos || [];
    const mine = all.filter(t => t.target === 'indesign' && !t.done), site = all.filter(t => t.target !== 'indesign' && !t.done), done = all.filter(t => t.done);
    const item = t => `<label class="todo ${t.done ? 'done' : ''}"><input type="checkbox" data-todo="${esc(t.id)}" ${t.done ? 'checked' : ''}><span>${t.page ? `<b>p. ${esc(t.page)}</b> ` : ''}${esc(t.text)}</span></label>`;
    return `<section class="card"><div class="eyebrow">À faire dans InDesign · ${mine.length}</div>
        <div class="scroll">${mine.map(item).join('') || '<p class="muted small">Rien pour l\'instant.</p>'}</div>
        <div class="addrow"><input id="td-text" placeholder="Nouvelle note…"><input id="td-page" placeholder="p." class="pg"><button class="btn sm" id="td-add">Ajouter</button></div></section>
      ${site.length ? `<section class="card"><div class="eyebrow">À faire sur le site · ${site.length}</div><div class="scroll">${site.map(t => `<div class="small todo">${t.page ? `<b>p. ${esc(t.page)}</b> ` : ''}${esc(t.text)}</div>`).join('')}</div></section>` : ''}
      ${done.length ? `<button class="linkbtn" id="td-done">${ui.showDone ? 'Masquer' : 'Voir'} les ${done.length} terminée${done.length > 1 ? 's' : ''}</button>${ui.showDone ? `<section class="card"><div class="scroll">${done.map(item).join('')}</div></section>` : ''}` : ''}`;
  }

  function logTab() {
    const inc = incidents();
    return `${inc.length ? `<section class="card warn"><div class="eyebrow">Incidents · ${inc.length}</div><div class="log">${inc.map(l => `<div><b>${time(l.t)}</b>${esc(l.msg)}</div>`).join('')}</div></section>` : ''}
      <section class="card"><div class="eyebrow">Journal</div>${engine.log.length ? `<div class="log">${engine.log.map(l => `<div class="${isIncident(l.msg) ? 'bad' : ''}"><b>${time(l.t)}</b>${esc(l.msg)}</div>`).join('')}</div>` : '<p class="muted small">Rien pour l\'instant.</p>'}</section>`;
  }

  function header() {
    return `<header class="hd"><span class="logo" aria-hidden="true"><i></i><i></i></span><b>moodbook</b><span class="sp"></span>
      ${engine.me ? `<button class="iconbtn" id="menu" aria-label="Menu" aria-expanded="${ui.menu}">${I.more}</button>` : ''}</header>
      ${ui.menu && engine.me ? `<div class="menu"><div class="muted small">${esc(engine.me.email)}</div>
        <button class="mitem" id="pick">Placer une photo…</button><p class="hint" style="margin:0 8px 6px">Pour une photo refusée par InDesign (WhatsApp) : sélectionnez le bloc, choisissez la photo, le panneau la convertit si besoin.</p>
        <button class="mitem" id="out">Se déconnecter</button></div>` : ''}`;
  }

  function render() {
    const el = $('app'); if (!el) return;
    if (!engine.me) {
      el.innerHTML = header() + `<section class="card"><div class="eyebrow">Connexion</div><h2>Bienvenue</h2><p class="muted small">Connectez-vous avec votre compte moodbook, le même que sur le site. La connexion est gardée d'une version du panneau à l'autre.</p>
        <label class="lbl" for="em">Adresse e-mail</label><input id="em" type="email" value="${esc(ui.email)}"><label class="lbl" for="pw">Mot de passe</label><input id="pw" type="password">
        <button class="btn primary block" id="login">Se connecter</button>${ui.err ? `<p class="err small">${esc(ui.err)}</p>` : ''}</section>`;
      return;
    }
    const doc = dom.activeDoc();
    let body = '';
    if (!doc) body = `<section class="card"><div class="eyebrow">Aucun document</div><p>Ouvrez le fichier de conception (MEP) ou le fichier livre d'un livre.</p><p class="hint">Depuis le site, la fenêtre « Fichiers InDesign » peut aussi les ouvrir ici.</p></section>`;
    else if (engine.pending) body = pendingBox(doc);
    else if (!engine.link) body = linkForm(doc);
    else {
      const nNotes = (engine.todos || []).filter(t => t.target === 'indesign' && !t.done).length;
      const nInc = incidents().filter(x => x.t > ui.seenLog).length;
      if (ui.tab === 'log') ui.seenLog = Date.now();
      const tab = (id, label, badge, cls) => `<button role="tab" class="tab ${ui.tab === id ? 'on' : ''}" data-tab="${id}" aria-selected="${ui.tab === id}">${label}${badge ? `<span class="badge ${cls || ''}">${badge}</span>` : ''}</button>`;
      body = `<nav class="tabs" role="tablist">${tab('sync', 'Synchro')}${tab('notes', 'Notes', nNotes)}${tab('log', 'Journal', ui.tab === 'log' ? 0 : nInc, 'warn')}</nav>`
        + (ui.tab === 'notes' ? notesTab() : ui.tab === 'log' ? logTab() : syncTab(doc));
    }
    const focus = document.activeElement && document.activeElement.id; const keep = focus && $(focus) && $(focus).value;
    el.innerHTML = header() + body;
    if (/^(td-text|td-page|nb-title|nb-year|nb-pages)$/.test(focus || '')) { const f = $(focus); if (f) { f.value = keep || ''; f.focus(); } }
  }

  document.addEventListener('click', async e => {
    const t = e.target.closest ? e.target.closest('button') : e.target; if (!t || t.tagName !== 'BUTTON') { if (ui.menu) { ui.menu = false; render(); } return; }
    const doc = dom.activeDoc();
    if (ui.menu && t.id !== 'menu') ui.menu = false;
    try {
      if (t.id === 'menu') { ui.menu = !ui.menu; render(); }
      else if (t.id === 'login') {
        ui.err = ''; const em = $('em').value.trim(), pw = $('pw').value; ui.email = em; store.setItem('mb-email', em);
        engine.me = await api.login(em, pw); render(); loadBooks();
      } else if (t.id === 'out') { await engine.onClosed(false); api.logout(); store.removeItem('mb-session'); engine.me = null; render(); }
      else if (t.dataset && t.dataset.tab) { ui.tab = t.dataset.tab; render(); }
      else if (t.id === 'go-log') { ui.tab = 'log'; render(); }
      else if (t.dataset && t.dataset.role) { ui.role = t.dataset.role; render(); }
      else if (t.id === 'link') {
        if (!doc) return; ui.err = '';
        let b;
        if (ui.bookSel === NEW) {
          const title = ($('nb-title').value || '').trim(), year = ($('nb-year').value || '').trim(), pages = parseInt($('nb-pages').value, 10);
          ui.nb = { title, year, pages: String($('nb-pages').value || '') };
          if (!title) { ui.err = 'Donnez un titre au livre.'; render(); return; }
          if (!(pages >= 4) || pages % 4) { ui.err = 'Le nombre de pages doit être un multiple de 4.'; render(); return; }
          ui.progress = 'Création du livre sur le site…'; render();
          b = await api.createBook(title, year, pages);
          engine.say('Livre « ' + title + ' » créé sur le site.');
        } else b = ui.books.find(x => bookKey(x) === ($('bk') && $('bk').value));
        if (!b) return;
        ui.progress = 'Liaison…'; render();
        const cur = ui.bookSel === NEW ? null : docsOf(b).find(d => d.role === ui.role);
        await engine.linkDoc(doc, { owner: b.owner, id: b.id, title: b.title }, ui.role, !!cur, { fresh: ui.role === 'livre' && !!b.doc });
        ui.progress = ''; ui.tab = 'sync'; await loadBooks();
      } else if (t.id === 'go') {
        if (!doc || !engine.link) return; const l = engine.link;
        ui.err = ''; ui.progress = 'Lecture du document…'; render();
        await engine.startCreation(doc, { owner: l.owner, id: l.book, title: l.title }, msg => { ui.progress = msg; render(); });
        ui.progress = ''; await loadBooks();
      } else if (t.dataset && t.dataset.ch) { await engine.choose(doc, t.dataset.ch); await loadBooks(); }
      else if (t.id === 'unlink') { await engine.unlinkDoc(doc); await loadBooks(); }
      else if (t.id === 'now') { if (doc) { await engine.fetchChanged(); await engine.sync(doc, { full: true }); } }
      else if (t.id === 'pick') { render(); if (doc) { const r = await dom.pickAndPlace(doc); if (r) engine.say(r.converted ? '« ' + r.name + ' » refusée par InDesign : convertie et placée (' + r.converted.split('/').pop() + ').' : '« ' + r.name + ' » placée.'); } }
      else if (t.id === 'fix') { if (doc) await engine.resync(doc, engine.bind); }
      else if (t.id === 'tgw') { ui.showWaiting = !ui.showWaiting; render(); }
      else if (t.id === 'td-done') { ui.showDone = !ui.showDone; render(); }
      else if (t.id === 'td-add') { const v = $('td-text').value; const pg = parseInt($('td-page').value, 10); $('td-text').value = ''; $('td-page').value = ''; await engine.todoAdd(v, pg > 0 ? pg : null); }
      else if (t.id === 'all-site') await engine.resolveAll('site');
      else if (t.id === 'all-mine') await engine.resolveAll('mine');
      else if (t.dataset && t.dataset.res) await engine.resolve(t.dataset.bid, t.dataset.res);
    } catch (err) { ui.err = err.message; ui.progress = ''; engine.say('Erreur : ' + err.message); render(); }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'bk') { ui.bookSel = e.target.value; ui.err = ''; render(); }
    else if (e.target.dataset && e.target.dataset.todo) engine.todoDone(e.target.dataset.todo, e.target.checked).catch(err => { ui.err = err.message; render(); });
  });
  document.addEventListener('input', e => { if (/^nb-/.test(e.target.id || '') && ui.nb) ui.nb[e.target.id.slice(3)] = e.target.value; });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.target.id === 'td-text' || e.target.id === 'td-page')) { const b = $('td-add'); if (b) b.click(); }
    if (e.key === 'Enter' && (e.target.id === 'em' || e.target.id === 'pw')) { const b = $('login'); if (b) b.click(); }
  });
  async function loadBooks() {
    try {
      const [bs, crs, docs] = await Promise.all([api.books(), api.creations(), api.projectDocs()]);
      bs.forEach(b => { const c = crs.find(x => x.owner === b.owner && x.book_id === b.id); b.doc = c ? (c.doc || '?') : ''; });
      ui.books = bs; ui.docs = docs; ui.forDoc = '';
    } catch (e) { ui.err = e.message; }
    render();
  }

  async function start() {
    engine.me = await api.check(); render();
    if (engine.me) loadBooks();
    setInterval(() => { if (engine.me) engine.tick(); }, 1500);
    setInterval(() => { const a = document.activeElement; if (!a || !/^(td-|em|pw|nb-|bk)/.test(a.id || '')) render(); }, 15000);
  }
  uxp.entrypoints.setup({ panels: { moodbookPanel: { show() { render(); } } } });
  start();
})();
