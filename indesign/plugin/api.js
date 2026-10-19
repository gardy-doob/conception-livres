// moodbook · accès à l'espace en ligne (Supabase) par simples requêtes web, sans bibliothèque externe
(function (root) {
  'use strict';
  function makeApi(cfg, store, fetchFn) {
    const F = fetchFn || ((u, o) => fetch(u, o));
    let session = null;
    try { session = JSON.parse(store.getItem('mb-session') || 'null'); } catch (e) {}
    const keep = s => { session = s; try { store.setItem('mb-session', JSON.stringify(s)); } catch (e) {} };
    async function raw(path, opt, retried) {
      opt = opt || {};
      const h = Object.assign({ apikey: cfg.supabaseKey, 'Content-Type': 'application/json' }, opt.headers || {});
      if (session && !opt.noAuth) h.Authorization = 'Bearer ' + session.access_token;
      const r = await F(cfg.supabaseUrl + path, { method: opt.method || 'GET', headers: h, body: opt.body === undefined ? undefined : JSON.stringify(opt.body) });
      const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = t; }
      if (r.status === 401 && session && !retried && !opt.noAuth) { await refresh(); return raw(path, opt, true); }
      if (!r.ok) throw new Error((j && (j.message || j.error_description || j.msg || j.error)) || ('erreur ' + r.status));
      return j;
    }
    async function refresh() {
      if (!session || !session.refresh_token) throw new Error('Reconnectez-vous.');
      const s = await raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token }, noAuth: true });
      keep(s);
    }
    const q = v => encodeURIComponent(v);
    const api = {
      get user() { return session && session.user ? { id: session.user.id, email: session.user.email, name: nameOf(session.user.email) } : null; },
      async login(email, password) { keep(await raw('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password }, noAuth: true })); return api.user; },
      logout() { keep(null); },
      async check() { if (!session) return null; try { await raw('/auth/v1/user'); return api.user; } catch (e) { return null; } },
      async books() {
        const rows = await raw('/rest/v1/books?select=id,user_id,title:data->>title,year:data->>year&order=updated_at.desc');
        return rows.map(r => ({ id: r.id, owner: r.user_id, title: r.title || r.id, year: r.year, shared: session && r.user_id !== session.user.id }));
      },
      async bookInfo(owner, id) {
        const rows = await raw('/rest/v1/books?select=title:data->>title,root:data->>photoRoot,folders:data->photoFolders,pl:data->pl&user_id=eq.' + q(owner) + '&id=eq.' + q(id));
        const r = rows[0] || {}; const ph = new Set(); (r.pl || []).forEach(l => (l.ph || []).forEach(x => ph.add(String(x).toLowerCase())));
        return { title: r.title || id, root: r.root || '', folders: (r.folders || []).map(f => f.name), placeholders: [...ph] };
      },
      async blocks(owner, id, since) {
        const out = [];
        for (let from = 0; ; from += 500) {
          const rows = await raw('/rest/v1/blocks?select=*&owner=eq.' + q(owner) + '&book_id=eq.' + q(id) + (since ? '&updated_at=gt.' + q(since) : '') + '&order=updated_at.asc', { headers: { Range: from + '-' + (from + 499) } });
          out.push(...rows); if (rows.length < 500) break;
        }
        return out;
      },
      rpc(fn, args) { return raw('/rest/v1/rpc/' + fn, { method: 'POST', body: args }); },
      saveCreation(owner, id, data) { return raw('/rest/v1/creations', { method: 'POST', body: { owner, book_id: id, data, updated_at: new Date().toISOString() }, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } }); },
      putImage(owner, id, key, data) { return raw('/rest/v1/creation_images', { method: 'POST', body: { owner, book_id: id, key, data }, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } }); },
      presence(row) { return raw('/rest/v1/book_presence', { method: 'POST', body: Object.assign({}, row, { seen_at: new Date().toISOString() }), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } }); },
      presenceList(owner, id) { return raw('/rest/v1/book_presence?select=*&owner=eq.' + q(owner) + '&book_id=eq.' + q(id)); },
      leave(owner, id, sid) { return raw('/rest/v1/book_presence?owner=eq.' + q(owner) + '&book_id=eq.' + q(id) + '&sid=eq.' + q(sid), { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); }
    };
    return api;
  }
  function nameOf(email) { const n = String(email || '').split('@')[0]; return n ? n.charAt(0).toUpperCase() + n.slice(1) : 'InDesign'; }
  if (typeof module !== 'undefined' && module.exports) module.exports = { makeApi }; else root.MBApi = { makeApi };
})(typeof window !== 'undefined' ? window : globalThis);
