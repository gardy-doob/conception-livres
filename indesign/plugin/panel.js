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
    else if (engine.pending) {
      const p = engine.pending; const t = esc(p.bind.title || p.bind.book);
      body = `<div class="box" style="border-color:#F2B657"><p><b>${esc(dom.docName(doc))}</b> est lié au livre <b>${t}</b>, mais ${p.reason === 'copy' ? 'ce n\'est pas le fichier qui a été lié : c\'est probablement une copie (fichier dupliqué ou « Enregistrer sous »).' : 'ce lien date d\'une ancienne version du panneau et doit être confirmé.'}</p>
        <p class="muted">Ce fichier : ${esc(dom.docKey(doc))}${p.reason === 'copy' ? `<br>Fichier lié à l'origine : ${esc(p.path)}` : ''}</p>
        <p class="muted">Rien n'est synchronisé tant que vous n'avez pas choisi.</p>
        <div class="row"><button class="primary" id="confirm">Oui, c'est le document de « ${t} »</button></div>
        <p class="muted">Le site reçoit alors les pages, photos et textes de ce document ; les textes écrits sur le site arrivent dans le document.</p>
        <div class="row"><button id="unlink">Non, délier ce document</button></div>
        <p class="muted">Le document n'appartient plus à aucun livre ; vous pourrez ensuite le passer en création pour le bon livre. Rien n'est modifié en ligne.</p></div>`;
    }
    else if (!engine.bind) {
      const books = ui.books;
      body = `<div class="box"><p><b>${esc(dom.docName(doc))}</b> n'est lié à aucun livre.</p>
        <p class="muted">« Passer en création » envoie les pages, les blocs photo et les blocs texte de ce document sur le site : la conception du livre est alors terminée, et le site et InDesign travaillent ensemble sur ce document.</p>
        ${books ? `<select id="bk">${books.map(b => `<option value="${esc(b.owner + '|' + b.id)}" ${ui.bookSel === b.owner + '|' + b.id ? 'selected' : ''}>${esc(b.title)}${b.year ? ' (' + esc(b.year) + ')' : ''}${b.shared ? ' · partagé' : ''}${b.doc ? ' · déjà en création (' + esc(b.doc) + ')' : ''}</option>`).join('')}</select>
          ${(() => { const b = books.find(x => x.owner + '|' + x.id === ui.bookSel); return b && b.doc ? `<p class="err">« ${esc(b.title)} » est déjà en création avec le document « ${esc(b.doc)} ». Le passer en création avec ce document-ci remplacerait ses pages, photos et textes sur le site.</p>
            <div class="row"><button class="primary" id="go">Remplacer par ce document</button></div>` : `<div class="row"><button class="primary" id="go">Passer en création</button></div>`; })()}` : '<p class="muted">Chargement des livres…</p>'}
        ${ui.progress ? `<p class="status">${esc(ui.progress)}</p>` : ''}${ui.err ? `<p class="err">${esc(ui.err)}</p>` : ''}</div>`;
    } else {
      const others = engine.others;
      body = `<div class="box"><div><b>${esc(engine.book && engine.book.title || engine.bind.title || '')}</b> <span class="muted">· ${esc(dom.docName(doc))}</span></div>
          <p class="status ${engine.live ? 'live' : 'calm'}">${engine.live ? '● Synchronisation en direct' : '● Synchronisation au calme'}</p>
          <p class="muted">${engine.live ? 'Les modifications partent au fil de l\'eau ; les blocs que vous touchez sont réservés pour vous.' : 'Personne d\'autre n\'est actif : vos modifications partent à l\'enregistrement, celles du site arrivent toutes les 20 secondes.'}</p>
          ${others.length ? others.map(o => `<div class="pres"><span class="dot ${o.active ? '' : 'idle'}"></span>${esc(o.name)} ${o.client === 'site' ? 'sur le site' : 'dans InDesign'}${o.active ? '' : ' (inactif)'}</div>`).join('') : '<p class="muted">Personne d\'autre sur le livre.</p>'}
          <div class="row"><button class="sm" id="now">Synchroniser maintenant</button><button class="sm" id="unlink">Délier ce document</button></div></div>
        ${engine.waiting.size ? `<div class="box"><div class="row"><b>En attente (${engine.waiting.size})</b><span class="muted">blocs en cours sur le site</span><button class="sm" id="tgw">${ui.showWaiting ? 'Masquer' : 'Voir'}</button></div>${!ui.showWaiting ? '' : `<div class="scroll">${[...engine.waiting.entries()].map(([bid, r]) => `<div>${bid.charAt(0) === 's' ? 'Texte' : 'Photo'} p. ${esc(r && r.page || '?')} · ${esc(r && r.lock_name || 'quelqu\'un')}</div>`).join('')}</div>`}</div>` : ''}
        ${engine.conflicts.size ? `<div class="box"><b>À réconcilier (${engine.conflicts.size})</b>
          ${engine.conflicts.size > 1 ? `<div class="row" style="margin:6px 0"><button class="sm primary" id="all-site">Tout prendre du site</button><button class="sm" id="all-mine">Tout garder d'InDesign</button></div>` : ''}
          <div class="scroll">${[...engine.conflicts.entries()].map(([bid, c]) => `<div class="conf"><div>${c.blk.kind === 'tx' ? 'Texte' : 'Photo'} p. ${esc(c.blk.page || '?')} modifié ici et ${c.row && c.row.src === 'site' ? 'sur le site' : 'ailleurs'}${c.row && c.row.by_name ? ' (' + esc(c.row.by_name) + ')' : ''}</div>
            <div class="muted">InDesign :</div><pre>${esc(plain(c.blk.data))}</pre><div class="muted">Site :</div><pre>${esc(plain(c.row && c.row.data))}</pre>
            <div class="row"><button class="sm" data-res="mine" data-bid="${bid}">Garder InDesign</button><button class="sm" data-res="site" data-bid="${bid}">Prendre le site</button>${c.blk.kind === 'tx' ? `<button class="sm" data-res="both" data-bid="${bid}">Les deux</button>` : ''}</div></div>`).join('')}</div></div>` : ''}`;
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
      else if (t.id === 'confirm') { await engine.confirmBinding(dom.activeDoc()); }
      else if (t.id === 'unlink') { await engine.unlinkDoc(dom.activeDoc()); loadBooks(); }
      else if (t.id === 'tgw') { ui.showWaiting = !ui.showWaiting; render(); }
      else if (t.id === 'all-site') await engine.resolveAll('site');
      else if (t.id === 'all-mine') await engine.resolveAll('mine');
      else if (t.dataset && t.dataset.res) await engine.resolve(t.dataset.bid, t.dataset.res);
    } catch (err) { ui.err = err.message; ui.progress = ''; render(); }
  });
  document.addEventListener('change', e => { if (e.target.id === 'bk') { ui.bookSel = e.target.value; render(); } });
  async function loadBooks() { try { const [bs, crs] = await Promise.all([api.books(), api.creations()]); bs.forEach(b => { const c = crs.find(x => x.owner === b.owner && x.book_id === b.id); b.doc = c ? (c.doc || '?') : ''; }); ui.books = bs; if (!ui.bookSel && ui.books[0]) ui.bookSel = ui.books[0].owner + '|' + ui.books[0].id; } catch (e) { ui.err = e.message; } render(); }

  async function start() {
    engine.me = await api.check(); render();
    if (engine.me) loadBooks();
    setInterval(() => { if (engine.me) engine.tick(); }, 1500);
    setInterval(render, 15000);
  }
  uxp.entrypoints.setup({ panels: { moodbookPanel: { show() { render(); } } } });
  start();
})();
