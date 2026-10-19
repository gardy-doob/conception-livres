// moodbook · panneau InDesign : interface et horloge de synchronisation
(function () {
  'use strict';
  const uxp = require('uxp');
  const ID = require('indesign');
  const store = window.localStorage;
  const api = MBApi.makeApi(window.CDF_CONFIG, store);
  const dom = MBDom.makeDom(ID, uxp);
  const ui = { books: null, bookSel: '', progress: '', err: '', email: store.getItem('mb-email') || '' };
  const engine = new MBEngine.Engine({ api, dom, store, onChange: () => render() });
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const time = t => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const plain = d => d && d.paras ? d.paras.map(p => (p.runs || []).map(r => r.t).join('')).join('\n') : (d && d.p ? d.p.split('/').pop() : '(vide)');

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
    if (!doc) body = `<div class="box"><p>Ouvrez le document InDesign final du livre.</p></div>`;
    else if (!engine.bind) {
      const books = ui.books;
      body = `<div class="box"><p><b>${esc(dom.docName(doc))}</b> n'est lié à aucun livre.</p>
        <p class="muted">« Passer en création » envoie les pages, les blocs photo et les blocs texte de ce document sur le site : la conception du livre est alors terminée, et le site et InDesign travaillent ensemble sur ce document.</p>
        ${books ? `<select id="bk">${books.map(b => `<option value="${esc(b.owner + '|' + b.id)}" ${ui.bookSel === b.owner + '|' + b.id ? 'selected' : ''}>${esc(b.title)}${b.year ? ' (' + esc(b.year) + ')' : ''}${b.shared ? ' · partagé' : ''}</option>`).join('')}</select>
          <div class="row"><button class="primary" id="go">Passer en création</button></div>` : '<p class="muted">Chargement des livres…</p>'}
        ${ui.progress ? `<p class="status">${esc(ui.progress)}</p>` : ''}${ui.err ? `<p class="err">${esc(ui.err)}</p>` : ''}</div>`;
    } else {
      const others = engine.others;
      body = `<div class="box"><div><b>${esc(engine.book && engine.book.title || engine.bind.title || '')}</b> <span class="muted">· ${esc(dom.docName(doc))}</span></div>
          <p class="status ${engine.live ? 'live' : 'calm'}">${engine.live ? '● Synchronisation en direct' : '● Synchronisation au calme'}</p>
          <p class="muted">${engine.live ? 'Les modifications partent au fil de l\'eau ; les blocs que vous touchez sont réservés pour vous.' : 'Personne d\'autre n\'est actif : vos modifications partent à l\'enregistrement, celles du site arrivent toutes les 20 secondes.'}</p>
          ${others.length ? others.map(o => `<div class="pres"><span class="dot ${o.active ? '' : 'idle'}"></span>${esc(o.name)} ${o.client === 'site' ? 'sur le site' : 'dans InDesign'}${o.active ? '' : ' (inactif)'}</div>`).join('') : '<p class="muted">Personne d\'autre sur le livre.</p>'}
          <div class="row"><button class="sm" id="now">Synchroniser maintenant</button></div></div>
        ${engine.waiting.size ? `<div class="box"><b>En attente</b>${[...engine.waiting.entries()].map(([bid, r]) => `<p>${bid.charAt(0) === 's' ? 'Texte' : 'Photo'} p. ${esc(r && r.page || '?')} : en cours sur le site par ${esc(r && r.lock_name || 'quelqu\'un')}.</p>`).join('')}</div>` : ''}
        ${engine.conflicts.size ? `<div class="box"><b>À réconcilier</b>${[...engine.conflicts.entries()].map(([bid, c]) => `<div class="conf"><div>${c.blk.kind === 'tx' ? 'Texte' : 'Photo'} p. ${esc(c.blk.page || '?')} modifié ici et ${c.row && c.row.src === 'site' ? 'sur le site' : 'ailleurs'}${c.row && c.row.by_name ? ' (' + esc(c.row.by_name) + ')' : ''}</div>
            <div class="muted">InDesign :</div><pre>${esc(plain(c.blk.data))}</pre><div class="muted">Site :</div><pre>${esc(plain(c.row && c.row.data))}</pre>
            <div class="row"><button class="sm" data-res="mine" data-bid="${bid}">Garder InDesign</button><button class="sm" data-res="site" data-bid="${bid}">Prendre le site</button>${c.blk.kind === 'tx' ? `<button class="sm" data-res="both" data-bid="${bid}">Les deux</button>` : ''}</div></div>`).join('')}</div>` : ''}`;
    }
    el.innerHTML = `<div class="row muted">${esc(engine.me.email)} <button class="sm" id="out">Se déconnecter</button></div>${body}
      ${engine.log.length ? `<div class="box"><b>Journal</b><div class="log">${engine.log.map(l => `<div><b>${time(l.t)}</b>${esc(l.msg)}</div>`).join('')}</div></div>` : ''}`;
  }

  document.addEventListener('click', async e => {
    const t = e.target.closest ? e.target.closest('button') : e.target; if (!t) return;
    try {
      if (t.id === 'login') {
        ui.err = ''; const em = $('em').value.trim(), pw = $('pw').value; ui.email = em; store.setItem('mb-email', em);
        engine.me = await api.login(em, pw); render(); loadBooks();
      } else if (t.id === 'out') { await engine.onClosed(false); api.logout(); engine.me = null; render(); }
      else if (t.id === 'go') {
        const doc = dom.activeDoc(); const v = $('bk').value; const b = ui.books.find(x => x.owner + '|' + x.id === v); if (!doc || !b) return;
        ui.err = ''; ui.progress = 'Lecture du document…'; render();
        await engine.startCreation(doc, b, msg => { ui.progress = msg; render(); });
        ui.progress = ''; render();
      } else if (t.id === 'now') { const doc = dom.activeDoc(); if (doc) { await engine.fetchChanged(); await engine.sync(doc, { full: true }); } }
      else if (t.dataset && t.dataset.res) await engine.resolve(t.dataset.bid, t.dataset.res);
    } catch (err) { ui.err = err.message; ui.progress = ''; render(); }
  });
  document.addEventListener('change', e => { if (e.target.id === 'bk') ui.bookSel = e.target.value; });
  async function loadBooks() { try { ui.books = await api.books(); if (!ui.bookSel && ui.books[0]) ui.bookSel = ui.books[0].owner + '|' + ui.books[0].id; } catch (e) { ui.err = e.message; } render(); }

  async function start() {
    engine.me = await api.check(); render();
    if (engine.me) loadBooks();
    setInterval(() => { if (engine.me) engine.tick(); }, 1500);
    setInterval(render, 15000);
  }
  uxp.entrypoints.setup({ panels: { moodbookPanel: { show() { render(); } } } });
  start();
})();
