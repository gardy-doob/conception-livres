// moodbook · panneau InDesign : interface et horloge de synchronisation
(function () {
  'use strict';
  const uxp = require('uxp');
  const ID = require('indesign');
  const store = window.localStorage;
  const api = MBApi.makeApi(window.CDF_CONFIG, store);
  const dom = MBDom.makeDom(ID, uxp);
  const ui = { books: null, docs: [], bookSel: '', role: '', progress: '', err: '', email: store.getItem('mb-email') || '', showWaiting: false, showDone: false, forDoc: '' };
  const engine = new MBEngine.Engine({ api, dom, store, onChange: () => render() });
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const time = t => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const plain = d => d && d.paras ? d.paras.map(p => (p.runs || []).map(r => r.t).join('')).join('\n') : (d && d.p ? d.p.split('/').pop() : '(vide)');
  const ROLE = { mep: 'fichier de conception (MEP)', livre: 'fichier livre' };
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const bookKey = b => b.owner + '|' + b.id;
  const docsOf = b => ui.docs.filter(d => d.owner === b.owner && d.book_id === b.id);

  // Suggest the project and the role from the file name: « Madrid - MEP » → Madrid, conception ; « Madrid » → Madrid, livre
  function suggest(doc) {
    const name = dom.docName(doc); const isMep = /(^|[\s_-])MEP($|[\s_-])/i.test(name);
    const base = norm(name.replace(/[\s_-]*MEP[\s_-]*/i, ' '));
    const hit = (ui.books || []).find(b => norm(b.title) === base) || (ui.books || []).find(b => base && (base.includes(norm(b.title)) || norm(b.title).includes(base)));
    return { role: isMep ? 'mep' : 'livre', key: hit ? bookKey(hit) : '' };
  }

  function pendingBox(doc) {
    const p = engine.pending; const t = esc(p.title || (p.book && p.book.title) || '');
    const here = `<p class="muted">Ce fichier : ${esc(dom.docKey(doc))}</p>`;
    if (p.kind === 'copy') return `<div class="box warn"><p><b>${esc(dom.docName(doc))}</b> est relié à <b>${t}</b> comme ${ROLE[p.role]}, mais il n'est pas à l'emplacement enregistré :</p>
      <p class="muted">Emplacement relié : ${esc(p.reg.path)}</p>${here}<p class="muted">Rien n'est synchronisé tant que vous n'avez pas choisi.</p>
      <div class="row"><button class="primary" data-ch="detach">C'est une copie : la détacher</button></div>
      <p class="muted">La copie n'appartient plus à aucun projet ; vous pourrez la relier au bon projet juste après. Le fichier d'origine garde son lien.</p>
      <div class="row"><button data-ch="moved">C'est le même fichier, déplacé ou renommé</button></div></div>`;
    if (p.kind === 'old' || p.kind === 'copy-old') return `<div class="box warn"><p><b>${esc(dom.docName(doc))}</b> a été lié à <b>${t}</b> par une ancienne version du panneau${p.kind === 'copy-old' ? ', mais depuis un autre emplacement : c\'est peut-être une copie' : ''}.</p>
      ${p.kind === 'copy-old' ? `<p class="muted">Emplacement lié : ${esc(p.path)}</p>` : ''}${here}<p class="muted">Rien n'est synchronisé tant que vous n'avez pas choisi.</p>
      <div class="row"><button class="primary" data-ch="confirm">Oui, c'est le fichier livre de « ${t} »</button></div>
      <p class="muted">Synchronisation corrective : ce fichier devient la référence du projet ; les textes écrits sur le site y arrivent.</p>
      <div class="row"><button data-ch="detach">Non, détacher ce fichier</button></div></div>`;
    if (p.kind === 'taken') return `<div class="box warn"><p><b>${t}</b> a déjà un ${ROLE[p.role]} : <b>${esc(p.res.name || '?')}</b>.</p><p class="muted">${esc(p.res.path || '')}</p>
      <div class="row"><button class="primary" data-ch="force">Le remplacer par ce fichier</button><button data-ch="cancel">Annuler</button></div>
      ${p.role === 'livre' ? '<p class="muted">Le projet suivra alors ce fichier-ci (synchronisation corrective) ; l\'autre ne sera plus synchronisé.</p>' : ''}</div>`;
    if (p.kind === 'other') { const ob = (ui.books || []).find(b => b.id === p.res.book && b.owner === p.res.owner);
      return `<div class="box warn"><p>Ce fichier est déjà relié à <b>${esc(ob ? ob.title : p.res.book)}</b> comme ${ROLE[p.res.role]}.</p>
      <div class="row"><button class="primary" data-ch="force">Le relier à « ${t} » à la place</button><button data-ch="cancel">Annuler</button></div></div>`; }
    return `<div class="box warn"><p>Liaison impossible.</p><div class="row"><button data-ch="cancel">Réessayer</button></div></div>`;
  }

  function linkForm(doc) {
    const books = ui.books;
    if (!books) return `<div class="box"><p class="muted">Chargement des projets…</p></div>`;
    if (ui.forDoc !== dom.docKey(doc)) { const s = suggest(doc); ui.forDoc = dom.docKey(doc); ui.role = s.role; if (s.key) ui.bookSel = s.key; }
    const b = books.find(x => bookKey(x) === ui.bookSel) || books[0];
    const cur = b ? docsOf(b).find(d => d.role === ui.role) : null;
    const status = bk => { const ds = docsOf(bk); const m = ds.find(d => d.role === 'mep'), l = ds.find(d => d.role === 'livre'); return [m ? 'MEP ✓' : '', l ? 'livre ✓' : '', bk.doc ? 'en création' : ''].filter(Boolean).join(' · '); };
    return `<div class="box"><p><b>${esc(dom.docName(doc))}</b> n'est relié à aucun projet.</p>
      <p class="muted">Un projet = un fichier de conception (« Mon projet - MEP ») et un fichier livre (« Mon projet »).</p>
      <label class="muted">Projet</label>
      <select id="bk">${books.map(x => `<option value="${esc(bookKey(x))}" ${b && bookKey(x) === bookKey(b) ? 'selected' : ''}>${esc(x.title)}${x.year ? ' (' + esc(x.year) + ')' : ''}${x.shared ? ' · partagé' : ''}${status(x) ? ' — ' + esc(status(x)) : ''}</option>`).join('')}</select>
      <label class="muted">Ce fichier est</label>
      <div class="row"><button class="sm ${ui.role === 'mep' ? 'primary' : ''}" data-role="mep">Fichier de conception (MEP)</button><button class="sm ${ui.role === 'livre' ? 'primary' : ''}" data-role="livre">Fichier livre</button></div>
      ${cur ? `<p class="err">« ${esc(b.title)} » a déjà un ${ROLE[ui.role]} : « ${esc(cur.name)} ». Le relier ici le remplacera.</p>` : ''}
      ${b && ui.role === 'livre' && b.doc && !cur ? `<p class="muted">« ${esc(b.title)} » est déjà en création (document « ${esc(b.doc)} »). Relier ce fichier lance une synchronisation corrective.</p>` : ''}
      <div class="row" style="margin-top:8px"><button class="primary" id="link">Relier à « ${esc(b ? b.title : '')} »</button></div>
      ${ui.progress ? `<p class="status">${esc(ui.progress)}</p>` : ''}${ui.err ? `<p class="err">${esc(ui.err)}</p>` : ''}</div>`;
  }

  function todoBox() {
    const all = engine.todos || []; if (!engine.link) return '';
    const mine = all.filter(t => t.target === 'indesign' && !t.done), site = all.filter(t => t.target !== 'indesign' && !t.done), done = all.filter(t => t.done);
    const item = t => `<label class="todo ${t.done ? 'done' : ''}"><input type="checkbox" data-todo="${esc(t.id)}" ${t.done ? 'checked' : ''}><span>${t.page ? `<b>p. ${esc(t.page)}</b> ` : ''}${esc(t.text)}</span></label>`;
    return `<div class="box"><div class="row"><b>À faire dans InDesign (${mine.length})</b></div>
      <div class="scroll">${mine.map(item).join('') || '<p class="muted">Rien pour l\'instant.</p>'}</div>
      <div class="row" style="flex-wrap:nowrap"><input id="td-text" placeholder="Nouvelle note InDesign…"><input id="td-page" placeholder="p." style="width:48px"><button class="sm" id="td-add">Ajouter</button></div>
      ${site.length ? `<p class="muted">${site.length} note${site.length > 1 ? 's' : ''} à faire sur le site.</p>` : ''}
      ${done.length ? `<div class="row"><button class="sm" id="td-done">${ui.showDone ? 'Masquer' : 'Voir'} les ${done.length} terminée${done.length > 1 ? 's' : ''}</button></div>${ui.showDone ? `<div class="scroll">${done.map(item).join('')}</div>` : ''}` : ''}</div>`;
  }

  function render() {
    const el = $('app'); if (!el) return;
    if (!engine.me) {
      el.innerHTML = `<div class="box"><p>Connectez-vous avec votre compte moodbook (le même que sur le site).</p>
        <input id="em" type="email" placeholder="Adresse e-mail" value="${esc(ui.email)}"><input id="pw" type="password" placeholder="Mot de passe">
        <div class="row"><button class="primary" id="login">Se connecter</button></div>${ui.err ? `<p class="err">${esc(ui.err)}</p>` : ''}</div>`;
      return;
    }
    const doc = dom.activeDoc();
    let body = '';
    if (!doc) body = `<div class="box"><p>Ouvrez le fichier de conception (MEP) ou le fichier livre d'un projet.</p><p class="muted">Depuis le site, la fenêtre « Fichiers InDesign » peut aussi les ouvrir ici.</p></div>`;
    else if (engine.pending) body = pendingBox(doc);
    else if (!engine.link) body = linkForm(doc);
    else {
      const l = engine.link; const head = `<div><b>${esc(l.title)}</b> <span class="muted">· ${ROLE[l.role]}</span></div><div class="muted">${esc(dom.docName(doc))}</div>`;
      const unl = `<button class="sm" id="unlink">Délier ce fichier</button>`;
      if (l.role === 'mep') body = `<div class="box">${head}<p class="muted">Fichier de conception : exportez ses mises en page avec le script « Export MEP » et glissez le dossier sur le projet, onglet Mises en page.</p><div class="row">${unl}</div></div>`;
      else if (!engine.inCreation) body = `<div class="box">${head}<p class="muted">Le projet est encore en conception sur le site. « Passer en création » envoie les pages, blocs photo et blocs texte de ce fichier : le site et InDesign travaillent ensuite ensemble sur ce fichier.</p>
        <div class="row"><button class="primary" id="go">Passer en création</button>${unl}</div>${ui.progress ? `<p class="status">${esc(ui.progress)}</p>` : ''}${ui.err ? `<p class="err">${esc(ui.err)}</p>` : ''}</div>`;
      else {
        const others = engine.others;
        body = `<div class="box">${head}
          <p class="status ${engine.live ? 'live' : 'calm'}">${engine.live ? '● Synchronisation en direct' : '● Synchronisation au calme'}</p>
          <p class="muted">${engine.live ? 'Les modifications partent au fil de l\'eau ; les blocs que vous touchez sont réservés pour vous.' : 'Personne d\'autre n\'est actif : vos modifications partent à l\'enregistrement, celles du site arrivent toutes les 20 secondes.'}</p>
          ${others.length ? others.map(o => `<div class="pres"><span class="dot ${o.active ? '' : 'idle'}"></span>${esc(o.name)} ${o.client === 'site' ? 'sur le site' : 'dans InDesign'}${o.active ? '' : ' (inactif)'}</div>`).join('') : '<p class="muted">Personne d\'autre sur le livre.</p>'}
          <div class="row"><button class="sm" id="now">Synchroniser maintenant</button><button class="sm" id="fix">Resynchroniser</button>${unl}</div>
          <div class="row" style="margin-top:6px"><button class="sm" id="kind">Sélection : décor ⇄ bloc photo</button></div></div>
        ${engine.waiting.size ? `<div class="box"><div class="row"><b>En attente (${engine.waiting.size})</b><span class="muted">blocs en cours sur le site</span><button class="sm" id="tgw">${ui.showWaiting ? 'Masquer' : 'Voir'}</button></div>${!ui.showWaiting ? '' : `<div class="scroll">${[...engine.waiting.entries()].map(([bid, r]) => `<div>${bid.charAt(0) === 's' ? 'Texte' : 'Photo'} p. ${esc(r && r.page || '?')} · ${esc(r && r.lock_name || 'quelqu\'un')}</div>`).join('')}</div>`}</div>` : ''}
        ${engine.conflicts.size ? `<div class="box"><b>À réconcilier (${engine.conflicts.size})</b>
          ${engine.conflicts.size > 1 ? `<div class="row" style="margin:6px 0"><button class="sm primary" id="all-site">Tout prendre du site</button><button class="sm" id="all-mine">Tout garder d'InDesign</button></div>` : ''}
          <div class="scroll">${[...engine.conflicts.entries()].map(([bid, c]) => `<div class="conf"><div>${c.blk.kind === 'tx' ? 'Texte' : 'Photo'} p. ${esc(c.blk.page || '?')} modifié ici et ${c.row && c.row.src === 'site' ? 'sur le site' : 'ailleurs'}${c.row && c.row.by_name ? ' (' + esc(c.row.by_name) + ')' : ''}</div>
            <div class="muted">InDesign :</div><pre>${esc(plain(c.blk.data))}</pre><div class="muted">Site :</div><pre>${esc(plain(c.row && c.row.data))}</pre>
            <div class="row"><button class="sm" data-res="mine" data-bid="${bid}">Garder InDesign</button><button class="sm" data-res="site" data-bid="${bid}">Prendre le site</button>${c.blk.kind === 'tx' ? `<button class="sm" data-res="both" data-bid="${bid}">Les deux</button>` : ''}</div></div>`).join('')}</div></div>` : ''}`;
      }
      body += todoBox();
    }
    const focus = document.activeElement && document.activeElement.id; const keep = focus && $(focus) && $(focus).value;
    el.innerHTML = `<div class="row muted">${esc(engine.me.email)} <button class="sm" id="out">Se déconnecter</button></div>${body}
      ${engine.log.length ? `<div class="box"><b>Journal</b><div class="log">${engine.log.map(l => `<div><b>${time(l.t)}</b>${esc(l.msg)}</div>`).join('')}</div></div>` : ''}`;
    if (focus === 'td-text' || focus === 'td-page') { const f = $(focus); if (f) { f.value = keep || ''; f.focus(); } }
  }

  document.addEventListener('click', async e => {
    const t = e.target.closest ? e.target.closest('button') : e.target; if (!t || t.tagName !== 'BUTTON') return;
    const doc = dom.activeDoc();
    try {
      if (t.id === 'login') {
        ui.err = ''; const em = $('em').value.trim(), pw = $('pw').value; ui.email = em; store.setItem('mb-email', em);
        engine.me = await api.login(em, pw); render(); loadBooks();
      } else if (t.id === 'out') { await engine.onClosed(false); api.logout(); engine.me = null; render(); }
      else if (t.dataset && t.dataset.role) { ui.role = t.dataset.role; render(); }
      else if (t.id === 'link') {
        const b = ui.books.find(x => bookKey(x) === ($('bk') && $('bk').value)); if (!doc || !b) return;
        ui.err = ''; ui.progress = 'Liaison…'; render();
        const cur = docsOf(b).find(d => d.role === ui.role);
        await engine.linkDoc(doc, { owner: b.owner, id: b.id, title: b.title }, ui.role, !!cur, { fresh: ui.role === 'livre' && !!b.doc });
        ui.progress = ''; await loadBooks();
      } else if (t.id === 'go') {
        if (!doc || !engine.link) return; const l = engine.link;
        ui.err = ''; ui.progress = 'Lecture du document…'; render();
        await engine.startCreation(doc, { owner: l.owner, id: l.book, title: l.title }, msg => { ui.progress = msg; render(); });
        ui.progress = ''; await loadBooks();
      } else if (t.dataset && t.dataset.ch) { await engine.choose(doc, t.dataset.ch); await loadBooks(); }
      else if (t.id === 'unlink') { await engine.unlinkDoc(doc); await loadBooks(); }
      else if (t.id === 'now') { if (doc) { await engine.fetchChanged(); await engine.sync(doc, { full: true }); } }
      else if (t.id === 'kind') { if (doc) await engine.toggleKind(doc); }
      else if (t.id === 'fix') { if (doc) await engine.resync(doc, engine.bind); }
      else if (t.id === 'tgw') { ui.showWaiting = !ui.showWaiting; render(); }
      else if (t.id === 'td-done') { ui.showDone = !ui.showDone; render(); }
      else if (t.id === 'td-add') { const v = $('td-text').value; const pg = parseInt($('td-page').value, 10); $('td-text').value = ''; $('td-page').value = ''; await engine.todoAdd(v, pg > 0 ? pg : null); }
      else if (t.id === 'all-site') await engine.resolveAll('site');
      else if (t.id === 'all-mine') await engine.resolveAll('mine');
      else if (t.dataset && t.dataset.res) await engine.resolve(t.dataset.bid, t.dataset.res);
    } catch (err) { ui.err = err.message; ui.progress = ''; render(); }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'bk') { ui.bookSel = e.target.value; render(); }
    else if (e.target.dataset && e.target.dataset.todo) engine.todoDone(e.target.dataset.todo, e.target.checked).catch(err => { ui.err = err.message; render(); });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.id === 'td-text' || e.target.id === 'td-page')) { const b = $('td-add'); if (b) b.click(); } });
  async function loadBooks() {
    try {
      const [bs, crs, docs] = await Promise.all([api.books(), api.creations(), api.projectDocs()]);
      bs.forEach(b => { const c = crs.find(x => x.owner === b.owner && x.book_id === b.id); b.doc = c ? (c.doc || '?') : ''; });
      ui.books = bs; ui.docs = docs; if (!ui.bookSel && bs[0]) ui.bookSel = bookKey(bs[0]);
    } catch (e) { ui.err = e.message; }
    render();
  }

  async function start() {
    engine.me = await api.check(); render();
    if (engine.me) loadBooks();
    setInterval(() => { if (engine.me) engine.tick(); }, 1500);
    setInterval(() => { const a = document.activeElement; if (!a || !/^(td-|em|pw)/.test(a.id || '')) render(); }, 15000);
  }
  uxp.entrypoints.setup({ panels: { moodbookPanel: { show() { render(); } } } });
  start();
})();
