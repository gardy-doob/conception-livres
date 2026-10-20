// moodbook · moteur de synchronisation InDesign ⇄ site (logique pure, sans InDesign ni réseau)
// Chaque bloc (photo « f<id> », texte « s<id> ») est comparé à trois versions :
//   doc   = contenu actuel dans InDesign
//   site  = contenu en ligne (table blocks)
//   base  = contenu au dernier accord entre les deux (mémorisé par le panneau)
// doc == site → rien ; doc == base → le site a changé → on l'applique au document ;
// site == base → InDesign a changé → on l'envoie ; sinon → conflit (réconciliation).
// Les modifications envoyées avant l'enregistrement du document sont « non enregistrées » en ligne :
// enregistrement → validées ; fermeture sans enregistrer ou plantage → annulées en ligne.
(function (root) {
  'use strict';

  function mergeRuns(runs) {
    const out = [];
    for (const r of runs || []) {
      const t = String(r.t == null ? '' : r.t); if (!t) continue;
      const b = r.b ? 1 : 0, c = r.c ? 1 : 0, l = out[out.length - 1];
      if (l && l[1] === b && l[2] === c) l[0] += t; else out.push([t, b, c]);
    }
    return out;
  }
  // Same normalisation on both sides, so that a text read back from InDesign equals the one written by the site
  function norm(kind, data) {
    if (!data) return kind === 'ph' ? { p: null } : { paras: [] };
    if (kind === 'ph') return { p: data.p || null };
    const paras = (data.paras || []).map(p => ({ al: p.al === 'l' || p.al === 'r' ? p.al : '', r: mergeRuns(p.runs) }));
    while (paras.length && !paras[paras.length - 1].r.length) paras.pop();
    return { paras };
  }
  function hash(kind, data) {
    const s = JSON.stringify(norm(kind, data)); let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + ':' + s.length;
  }

  class Engine {
    constructor(opt) {
      this.api = opt.api; this.dom = opt.dom; this.store = opt.store; this.now = opt.now || (() => Date.now());
      this.sid = opt.sid || ('i' + Math.random().toString(36).slice(2, 10));
      this.onChange = opt.onChange || (() => {});
      this.me = null; this.bind = null; this.docKey = ''; this.rows = new Map();
      this.st = null;             // persisted state of the bound book: {base, applied, pushed}
      this.wasModified = false; this.live = false; this.others = [];
      this.conflicts = new Map(); this.waiting = new Map(); this.log = [];
      this.t = { poll: 0, scan: 0, beat: 0, pres: 0, saved: 0 };
      this.selBid = null; this.lockBid = null; this.lockAt = 0; this.busy = false; this.since = '';
      this.textCache = {}; this.lastActivity = 0; this.queued = new Set(); this.queuedFull = false;
    }
    say(msg) { this.log.unshift({ t: this.now(), msg }); this.log.length = Math.min(this.log.length, 40); this.onChange(); }
    key() { return this.bind ? 'mb:' + this.bind.owner + ':' + this.bind.book : ''; }
    loadState() {
      let s = null; try { s = JSON.parse(this.store.getItem(this.key()) || 'null'); } catch (e) {}
      if (s && s.v !== 2) s = { pages: s.pages || {} };   // older format: start the comparison again from the online versions
      this.st = Object.assign({ v: 2, base: {}, applied: {}, pushed: {} }, s || {});
    }
    saveState() { if (this.bind) try { this.store.setItem(this.key(), JSON.stringify(this.st)); } catch (e) {} }
    lockedByOther(r) { return !!(r && r.lock_until && new Date(r.lock_until).getTime() > this.now() && r.lock_sid !== this.sid); }

    // ---------- binding a document to a book ----------
    async activate(doc) {
      this.unbindLocal();
      this.docKey = this.dom.docKey(doc);
      const bind = this.dom.readBinding(doc);
      if (!bind || !this.me) { this.onChange(); return; }
      this.bind = bind; this.loadState(); this.wasModified = this.dom.isModified(doc);
      try {
        this.book = await this.api.bookInfo(bind.owner, bind.book);
        await this.fetchAll();
        // Left-over unsaved work from a previous session (InDesign quit without saving or crashed): the file on disk is
        // the last saved state, so the changes sent from InDesign since then are cancelled online
        if (!this.wasModified && (Object.keys(this.st.pushed).length || Object.keys(this.st.applied).length)) await this.recover('reprise après fermeture sans enregistrer ou plantage');
        await this.sync(doc, { full: true });
        this.say('Document lié à « ' + (this.book && this.book.title || bind.book) + ' ».');
      } catch (e) { this.say('Connexion impossible : ' + e.message); }
      this.onChange();
    }
    unbindLocal() { this.bind = null; this.st = null; this.rows = new Map(); this.conflicts.clear(); this.waiting.clear(); this.since = ''; this.lockBid = null; this.selBid = null; this.textCache = {}; }
    async fetchAll() { const rows = await this.api.blocks(this.bind.owner, this.bind.book); this.rows = new Map(rows.map(r => [r.bid, r])); this.since = rows.reduce((m, r) => r.updated_at > m ? r.updated_at : m, ''); }
    async fetchChanged() {
      const rows = await this.api.blocks(this.bind.owner, this.bind.book, this.since);
      const changed = [];
      for (const r of rows) { const old = this.rows.get(r.bid); if (r.updated_at > this.since) this.since = r.updated_at; if (!old || old.rev !== r.rev || old.lock_sid !== r.lock_sid || old.lock_until !== r.lock_until) { this.rows.set(r.bid, r); if (!old || old.rev !== r.rev) changed.push(r.bid); } }
      for (const [bid] of this.waiting) { const r = this.rows.get(bid); if (!this.lockedByOther(r)) { this.waiting.delete(bid); if (!changed.includes(bid)) changed.push(bid); } }
      return changed;
    }

    // ---------- the heart: compare doc / site / base for each block ----------
    // base[bid] = { dh: hash of the document content at the last agreement, rev: online version at that moment }
    // Who changed is decided by the version number online and by the document's own reading: a text written by the site
    // and read back by InDesign with tiny differences can never bounce back as a "change made in InDesign".
    async sync(doc, opt) {
      if (!this.bind) return;
      if (this.busy) { if (opt.only) opt.only.forEach(b => this.queued.add(b)); else this.queuedFull = this.queuedFull || !!opt.full || 'scan'; return; }
      this.busy = true;
      const mod = this.dom.isModified(doc);
      try {
        const blocks = this.dom.readBlocks(doc, { full: !!opt.full, cache: this.textCache, only: opt.only, root: this.book });
        for (const blk of blocks) await this.syncBlock(doc, blk, mod, opt);
        this.saveState();
      } finally { this.busy = false; }
      this.onChange();
      if (this.queued.size) { const only = [...this.queued]; this.queued.clear(); await this.sync(doc, { only, noPush: opt.noPush }); }
      if (this.queuedFull) { const f = this.queuedFull === true; this.queuedFull = false; await this.sync(doc, { full: f }); }
    }
    async syncBlock(doc, blk, mod, opt) {
      const { bid, kind } = blk; const row = this.rows.get(bid); const st = this.st;
      const h = hash(kind, blk.data); const live = row && !row.deleted; const siteH = live ? hash(kind, row.data) : null; const b0 = st.base[bid];
      if (siteH === h) { st.base[bid] = { dh: h, rev: row.rev }; this.conflicts.delete(bid); this.waiting.delete(bid); return; }
      let action;
      if (!live) action = 'push';
      else if (!b0) action = row.src === 'site' ? 'apply' : 'push';   // never compared yet: the site wins for what it wrote
      else {
        const docChanged = h !== b0.dh, siteChanged = row.rev !== b0.rev;
        if (!docChanged && !siteChanged) return;
        action = docChanged && siteChanged ? 'conflict' : docChanged ? 'push' : 'apply';
      }
      if (action === 'apply') return this.applySite(doc, blk, row);
      if (action === 'conflict') { if (!this.conflicts.has(bid)) this.say('Conflit sur ' + this.label(blk) + ' : modifié ici et ailleurs.'); this.conflicts.set(bid, { blk, row }); return; }
      if (opt.noPush) return;
      return this.push(blk, row, mod, h);
    }
    label(blk) { return (blk.kind === 'tx' ? 'le texte' : 'la photo') + ' p. ' + (blk.page || '?'); }
    async push(blk, row, mod, h) {
      const { bid } = blk;
      if (this.lockedByOther(row)) { if (!this.waiting.has(bid)) this.say(this.label(blk) + ' est en cours sur le site (' + (row.lock_name || '') + ') : votre modification attend.'); this.waiting.set(bid, row); return; }
      const prevBase = this.st.base[bid];
      const res = await this.api.rpc('block_save', { p_owner: this.bind.owner, p_book: this.bind.book, p_bid: bid, p_kind: blk.kind, p_page: blk.page,
        p_data: blk.kind === 'ph' ? { p: blk.data.p || null, ln: blk.data.ln || null } : { paras: blk.data.paras }, p_rev: row && !row.deleted ? row.rev : (row ? -1 : 0),
        p_src: 'id', p_committed: !mod, p_sid: this.sid, p_name: this.me.name });
      if (res && res.row) this.rows.set(bid, res.row);
      if (res && res.ok) {
        this.st.base[bid] = { dh: h, rev: res.row.rev }; this.waiting.delete(bid); this.conflicts.delete(bid);
        if (mod && !(bid in this.st.pushed)) this.st.pushed[bid] = prevBase === undefined ? null : prevBase;
        return;
      }
      if (res && res.reason === 'locked') { this.waiting.set(bid, res.row); return; }
      if (res && res.reason === 'rev') { this.conflicts.set(bid, { blk, row: res.row }); this.say('Conflit sur ' + this.label(blk) + '.'); }
    }
    async applySite(doc, blk, row) {
      const { bid } = blk;
      if (bid === this.selBid) return;               // the cursor is in this text: wait until it leaves it
      const prevBase = this.st.base[bid];
      try { this.dom.writeBlock(doc, blk, row.data, this.book); }
      catch (e) { this.say('Impossible d\'appliquer ' + this.label(blk) + ' : ' + e.message); return; }
      // Remember the text as InDesign reads it back (not as the site sent it)
      let dh = hash(blk.kind, row.data);
      try { const back = this.dom.readBlocks(doc, { only: [bid], cache: this.textCache, root: this.book })[0]; if (back) dh = hash(blk.kind, back.data); } catch (e) {}
      this.st.base[bid] = { dh, rev: row.rev };
      if (!(bid in this.st.applied)) this.st.applied[bid] = prevBase === undefined ? null : prevBase;
      this.conflicts.delete(bid); this.waiting.delete(bid);
      this.say((blk.kind === 'tx' ? 'Texte' : 'Photo') + ' p. ' + (blk.page || '?') + ' mis à jour depuis le site' + (row.by_name ? ' (' + row.by_name + ')' : '') + '.');
    }
    // Reconciliation in one go: every conflicting block takes the site version (or keeps InDesign's)
    async resolveAll(how) { for (const bid of [...this.conflicts.keys()]) await this.resolve(bid, how); }

    // ---------- going into Création: the document becomes the reference of the book ----------
    async startCreation(doc, book, progress) {
      progress = progress || (() => {});
      this.dom.writeBinding(doc, { owner: book.owner, book: book.id, title: book.title });
      this.unbindLocal(); this.docKey = this.dom.docKey(doc);
      this.bind = { owner: book.owner, book: book.id, title: book.title }; this.loadState(); this.st.pages = {};
      this.book = await this.api.bookInfo(book.owner, book.id);
      await this.publishStructure(doc, { force: true, progress });
      await this.fetchAll();
      progress('Envoi des blocs…');
      await this.sync(doc, { full: true });
      this.wasModified = this.dom.isModified(doc);
      this.say('Le livre « ' + book.title + ' » est passé en création. Enregistrez le document.');
    }
    // Pages, blocks and styles of the document; page previews only for pages that changed
    async publishStructure(doc, opt) {
      const s = this.dom.readStructure(doc, this.book); const pagesSt = this.st.pages || (this.st.pages = {});
      const changed = s.pages.filter(pg => opt.force || !pagesSt[pg.n] || pagesSt[pg.n].sig !== pg.sig);
      const known = Object.keys(pagesSt).length;
      if (!changed.length && known === s.pages.length) { s.pages.forEach(pg => pg.img = pagesSt[pg.n].img); return false; }
      let i = 0;
      for (const pg of changed) {
        i++; if (opt.progress) opt.progress('Aperçu des pages ' + i + '/' + changed.length + '…');
        try { const data = await this.dom.exportPreview(doc, pg); const key = 'p' + pg.n + '-' + pg.sig; await this.api.putImage(this.bind.owner, this.bind.book, key, data); pagesSt[pg.n] = { sig: pg.sig, img: key }; }
        catch (e) { this.say('Aperçu de la page ' + pg.n + ' impossible : ' + e.message); pagesSt[pg.n] = { sig: pg.sig, img: (pagesSt[pg.n] || {}).img || '' }; }
      }
      for (const n of Object.keys(pagesSt)) if (!s.pages.some(pg => String(pg.n) === n)) delete pagesSt[n];
      s.pages.forEach(pg => pg.img = (pagesSt[pg.n] || {}).img || '');
      await this.api.saveCreation(this.bind.owner, this.bind.book, { doc: this.dom.docName(doc), at: this.now(), pages: s.pages, stories: s.stories });
      this.saveState();
      if (!opt.force) this.say('Structure du document mise à jour en ligne (' + changed.length + ' page(s)).');
      return true;
    }

    // ---------- saving, closing without saving, crash ----------
    async onSaved(doc) {
      if (!this.bind) return;
      try { const n = await this.api.rpc('blocks_commit', { p_owner: this.bind.owner, p_book: this.bind.book }); if (n) this.say(n + ' modification(s) validée(s) en ligne (document enregistré).'); } catch (e) {}
      this.st.pushed = {}; this.st.applied = {}; this.saveState();
      try { await this.publishStructure(doc, {}); } catch (e) { this.say('Structure non envoyée : ' + e.message); }
      await this.sync(doc, { full: true });
    }
    // The document was closed without saving: what was sent from InDesign is cancelled online, what came from the site will be re-applied
    async recover(why) {
      if (!this.bind) return;
      let n = 0; try { n = await this.api.rpc('blocks_revert', { p_owner: this.bind.owner, p_book: this.bind.book }); } catch (e) {}
      for (const [bid, b0] of Object.entries(this.st.pushed)) { if (b0 === null) delete this.st.base[bid]; else this.st.base[bid] = b0; }
      for (const [bid, b0] of Object.entries(this.st.applied)) { if (b0 === null) delete this.st.base[bid]; else this.st.base[bid] = b0; }
      this.st.pushed = {}; this.st.applied = {}; this.saveState();
      try { await this.fetchAll(); } catch (e) {}
      this.say((n ? n + ' modification(s) non enregistrée(s) annulée(s) en ligne' : 'Aucune modification à annuler') + ' · ' + why + '.');
    }
    async onClosed(wasModified) {
      if (this.bind) {
        if (wasModified) await this.recover('document fermé sans enregistrer');
        await this.unlock(); try { await this.api.leave(this.bind.owner, this.bind.book, this.sid); } catch (e) {}
      }
      this.unbindLocal(); this.docKey = ''; this.onChange();
    }

    // ---------- presence, locks, live / calm ----------
    async beat(doc) {
      const page = this.dom.activePage(doc);
      try { await this.api.presence({ owner: this.bind.owner, book_id: this.bind.book, sid: this.sid, client: 'indesign', name: this.me.name, doc: this.dom.docName(doc), page, bid: this.lockBid, active: this.now() - this.lastActivity < 120000 }); } catch (e) {}
    }
    async readPresence() {
      try {
        const rows = await this.api.presenceList(this.bind.owner, this.bind.book);
        this.others = rows.filter(r => r.sid !== this.sid && this.now() - new Date(r.seen_at).getTime() < 60000);
      } catch (e) {}
      const live = this.others.some(r => r.client === 'site' && r.active);
      if (live !== this.live) { this.live = live; this.say(live ? 'Synchronisation en direct : ' + this.others.filter(r => r.client === 'site').map(r => r.name).join(', ') + ' est sur le livre.' : 'Synchronisation au calme (à l\'enregistrement).'); }
    }
    async lock(bid) {
      if (bid === this.lockBid && this.now() - this.lockAt < 20000) return;
      if (this.lockBid && this.lockBid !== bid) await this.unlock();
      if (!bid || !this.rows.has(bid)) return;
      try {
        const res = await this.api.rpc('block_lock', { p_owner: this.bind.owner, p_book: this.bind.book, p_bid: bid, p_sid: this.sid, p_name: this.me.name, p_client: 'indesign', p_ttl: 60 });
        if (res && res.row) this.rows.set(bid, res.row);
        if (res && res.ok) { this.lockBid = bid; this.lockAt = this.now(); }
        else if (res && res.row) { this.lockBid = null; this.say('Attention : ' + (res.row.lock_name || 'quelqu\'un') + ' modifie ce bloc sur le site. Vos changements n\'y seront pas envoyés.'); }
      } catch (e) {}
    }
    async unlock() { if (!this.lockBid || !this.bind) return; const bid = this.lockBid; this.lockBid = null; try { await this.api.rpc('block_unlock', { p_owner: this.bind.owner, p_book: this.bind.book, p_sid: this.sid, p_bid: bid }); } catch (e) {} }

    // ---------- the clock: called every 1.5 s by the panel ----------
    async tick() {
      if (this.ticking) return; this.ticking = true;
      try { await this._tick(); } catch (e) { this.say('Erreur : ' + e.message); } finally { this.ticking = false; }
    }
    async _tick() {
      const now = this.now(); const docs = this.dom.openDocKeys();
      if (this.docKey && !docs.includes(this.docKey)) { await this.onClosed(this.wasModified); }
      const doc = this.dom.activeDoc();
      if (!doc) return;
      if (this.dom.docKey(doc) !== this.docKey) { await this.activate(doc); return; }
      if (!this.bind) return;
      const mod = this.dom.isModified(doc);
      if (this.wasModified && !mod) { this.wasModified = false; this.t.saved = now; await this.onSaved(doc); return; }
      if (mod !== this.wasModified) { this.wasModified = mod; this.lastActivity = now; }
      const sel = this.dom.selectionBid(doc); if (sel !== this.selBid) { this.selBid = sel; this.lastActivity = now; }
      if (now - this.t.beat > 20000) { this.t.beat = now; await this.beat(doc); }
      if (now - this.t.pres > (this.live ? 10000 : 30000)) { this.t.pres = now; await this.readPresence(); }
      if (this.live) await this.lock(sel); else if (this.lockBid) await this.unlock();
      // Incoming changes from the site: every 2 s live, every 20 s otherwise
      if (now - this.t.poll > (this.live ? 2000 : 20000)) {
        this.t.poll = now;
        const changed = await this.fetchChanged();
        if (changed.length) await this.sync(doc, { full: false, only: changed, noPush: !this.live });
      }
      // Outgoing changes: live only (otherwise at the next save)
      if (this.live && mod && now - this.t.scan > 2500) { this.t.scan = now; await this.sync(doc, { full: false }); }
      // Safety net: a saved document (save not seen, e.g. saved within the same second) is compared every 30 s
      if (!mod && now - this.t.saved > 30000) {
        this.t.saved = now;
        if (Object.keys(this.st.pushed).length || Object.keys(this.st.applied).length) { await this.onSaved(doc); return; }
        try { await this.publishStructure(doc, {}); } catch (e) {}
        await this.sync(doc, { full: true });
      }
    }

    // ---------- reconciliation ----------
    async resolve(bid, how) {
      const c = this.conflicts.get(bid); if (!c) return; const doc = this.dom.activeDoc(); if (!doc) return;
      const row = this.rows.get(bid);
      if (how === 'site') { this.selBid = null; await this.applySite(doc, c.blk, row); }
      else if (how === 'mine') {
        const h = hash(c.blk.kind, c.blk.data); this.st.base[bid] = row ? { dh: '', rev: row.rev } : undefined;
        await this.push(c.blk, row, this.dom.isModified(doc), h);
      } else if (how === 'both' && c.blk.kind === 'tx') {
        const merged = { paras: [...((row && row.data && row.data.paras) || []), ...(c.blk.data.paras || [])] };
        this.selBid = null; this.dom.writeBlock(doc, c.blk, merged, this.book);
        const back = this.dom.readBlocks(doc, { only: [bid], cache: this.textCache, root: this.book })[0] || Object.assign({}, c.blk, { data: merged });
        this.st.base[bid] = { dh: '', rev: row.rev };
        await this.push(back, row, true, hash('tx', back.data));
      }
      this.conflicts.delete(bid); this.saveState(); this.onChange();
    }
  }

  const api = { Engine, hash, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MBEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
