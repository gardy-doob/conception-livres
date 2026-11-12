/* Moteur de conversation : lit SCENARIO, affiche les bulles, enregistre les réponses (local + serveur). */
(() => {
  const S = window.SCENARIO, N = S.nodes;
  const $ = s => document.querySelector(s);
  const chat = $('#chat'), form = $('#composer'), input = $('#input'), skipBtn = $('#skip'), sendBtn = $('.send'), bar = $('#bar'), status = $('#status');
  const KEY = 'enq.v1';
  const qIds = Object.keys(N).filter(k => /^Q\d\d$/.test(k)); // 30 questions pour la barre de progression
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const quick = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let st = load() || fresh();
  let pending = null; // ce que le moteur attend : {node, kind:'choice'|'multi'|'free', picked:Set}
  let saveT = null, replaying = false;

  function fresh() { return { sid: uid(), prenom: '', email: '', answers: {}, other: {}, log: [], step: null, done: false, started: new Date().toISOString(), updated: null, ua: navigator.userAgent.slice(0, 120) }; }
  function load() { try { const j = JSON.parse(localStorage.getItem(KEY)); return j && j.sid ? j : null; } catch (e) { return null; } }
  function persist() {
    st.updated = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { }
    clearTimeout(saveT); saveT = setTimeout(push, 500);
  }
  function push() {
    try { fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(st), keepalive: true }).catch(() => { }); } catch (e) { }
  }
  addEventListener('pagehide', () => { clearTimeout(saveT); push(); });

  // ---- affichage
  function bubble(who, text) {
    const d = document.createElement('div'); d.className = 'msg ' + who; d.textContent = text; chat.appendChild(d); scroll(); return d;
  }
  function scroll() { requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: replaying || quick ? 'auto' : 'smooth' })); }
  async function botSay(text, delayScale = 1) {
    if (!replaying && !quick) {
      const t = document.createElement('div'); t.className = 'typing'; t.innerHTML = '<i></i><i></i><i></i>'; chat.appendChild(t); scroll();
      await wait(Math.min(350 + text.length * 11, 1500) * delayScale); t.remove();
    }
    bubble('bot', text); st.log.push({ who: 'bot', text, t: Date.now() });
  }
  function textOf(node, key) { const v = node[key]; return typeof v === 'function' ? v(st.answers) : v; }
  function choicesOf(node) { const c = typeof node.choices === 'function' ? node.choices(st.answers) : node.choices; return c || null; }
  function setProgress(node) {
    const i = qIds.indexOf(node.id.slice(0, 3));
    if (i >= 0) bar.style.width = Math.round(((i + 1) / qIds.length) * 100) + '%';
    if (node.end) bar.style.width = '100%';
    if (node.chapter) status.textContent = `Partie ${node.chapter} sur 4 · ${S.chapters[node.chapter]}`;
  }

  // ---- composer
  function composer(mode, node) {
    form.classList.toggle('off', mode === 'none');
    input.disabled = mode === 'none'; sendBtn.disabled = mode === 'none';
    skipBtn.hidden = !(mode === 'free' && node && node.optional);
    input.placeholder = mode === 'free' ? (node.free === 'email' ? 'ton@email.fr' : node.free === 'name' ? 'Ton prénom' : 'Écris ta réponse…') : 'Ou réponds avec tes mots…';
    input.type = node && node.free === 'email' ? 'email' : 'text';
    input.autocomplete = node && node.free === 'email' ? 'email' : node && node.free === 'name' ? 'given-name' : 'off';
    if (mode === 'free' && !replaying && matchMedia('(min-width: 700px)').matches) input.focus();
  }
  function showChoices(node, list) {
    const box = document.createElement('div'); box.className = 'choices' + (list.some(c => c.t.length > 22) ? ' stack' : ''); box.setAttribute('role', 'group');
    const picked = new Set();
    list.forEach((c, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = c.t; b.dataset.k = c.k; b.className = 'c' + (i % 5);
      if (node.multi) {
        b.setAttribute('aria-pressed', 'false');
        b.onclick = () => {
          const on = b.getAttribute('aria-pressed') === 'true';
          if (!on && picked.size >= node.multi) return;
          if (on) picked.delete(c.k); else picked.add(c.k);
          b.setAttribute('aria-pressed', on ? 'false' : 'true');
          go.disabled = !picked.size; go.textContent = picked.size ? `Valider (${picked.size}/${node.multi})` : 'Valider';
          box.querySelectorAll('button:not(.go)').forEach(x => { x.disabled = picked.size >= node.multi && x.getAttribute('aria-pressed') !== 'true'; });
        };
      } else b.onclick = () => { box.remove(); answer(node, c.k, c.t); };
      box.appendChild(b);
    });
    let go;
    if (node.multi) {
      go = document.createElement('button'); go.type = 'button'; go.className = 'go'; go.textContent = 'Valider'; go.disabled = true;
      go.onclick = () => { const ks = list.filter(c => picked.has(c.k)); box.remove(); answer(node, ks.map(c => c.k).join(','), ks.map(c => c.t).join(' · ')); };
      box.appendChild(go);
    }
    chat.appendChild(box); scroll();
    pending.box = box;
  }

  // ---- moteur
  function hero() { const h = document.createElement('h1'); h.className = 'hero'; h.innerHTML = 'Ton livre<br>photo,<br><em>raconte.</em>'; chat.appendChild(h); }
  function endCard(text) { const c = document.createElement('div'); c.className = 'card'; c.innerHTML = '<h2></h2><p></p><span class="blob" aria-hidden="true"></span>'; c.querySelector('h2').textContent = 'Merci' + (st.prenom ? ' ' + st.prenom : '') + ' !'; c.querySelector('p').textContent = text; chat.appendChild(c); scroll(); }
  async function run(id) {
    const node = N[id]; if (!node) return finish();
    if (id === S.start && !chat.children.length) hero();
    st.step = id; persist(); setProgress(node);
    if (node.say) {
      if (node.end && id === 'fin') { const t = textOf(node, 'say'); if (!quick) { await wait(500); } endCard(t); st.log.push({ who: 'bot', text: t, t: Date.now() }); return finish(); }
      await botSay(textOf(node, 'say'));
      if (node.end) return finish();
      return run(typeof node.next === 'function' ? node.next(st.answers) : node.next);
    }
    await botSay(textOf(node, 'ask'));
    const list = choicesOf(node);
    pending = { node, kind: node.free ? 'free' : node.multi ? 'multi' : 'choice' };
    if (list) { showChoices(node, list); composer('text', node); }
    else composer('free', node);
  }
  function finish() { st.done = st.done || 'done'; st.step = 'fin'; persist(); composer('none'); bar.style.width = '100%'; }
  async function answer(node, value, label, extra) {
    pending = null; composer('none');
    bubble('me', label); st.log.push({ who: 'me', text: label, t: Date.now() });
    if (node.free === 'name') st.prenom = value; else if (node.free === 'email') st.email = value;
    else if (node.free) st.other[node.id] = value;
    else { st.answers[node.id] = value; if (extra) st.other[node.id] = extra; }
    persist();
    if (node.free === 'email' && value) { const r = await findByEmail(value); if (r) return; }
    const next = typeof node.next === 'function' ? node.next(st.answers, value) : node.next;
    run(next);
  }
  async function skip(node) {
    pending = null; composer('none');
    bubble('me', 'Je passe'); st.log.push({ who: 'me', text: 'Je passe', t: Date.now() });
    if (!node.free) st.answers[node.id] = '-'; else st.other[node.id] = '';
    persist();
    run(typeof node.next === 'function' ? node.next(st.answers, '-') : node.next);
  }

  // Texte libre tapé alors qu'un QCM est affiché : on demande au serveur de le rattacher à un choix (Claude), sinon on le garde en « autre ».
  async function freeOnChoice(node, text) {
    const list = choicesOf(node);
    if (pending.box) pending.box.remove();
    pending = null; composer('none');
    bubble('me', text); st.log.push({ who: 'me', text, t: Date.now() });
    let r = null;
    try {
      const res = await fetch('/api/interpret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: textOf(node, 'ask'), choices: list, text, multi: node.multi || 0 }) });
      if (res.ok) r = await res.json();
    } catch (e) { }
    if (r && r.choice) {
      st.answers[node.id] = r.choice; st.other[node.id] = text;
      await botSay(r.ack || `D'accord, je note ça comme « ${list.filter(c => r.choice.split(',').includes(c.k)).map(c => c.t).join(' · ')} ».`, 0.7);
    } else {
      st.answers[node.id] = '?'; st.other[node.id] = text;
      await botSay(r && r.ack ? r.ack : 'D\'accord, je note.', 0.6);
    }
    persist();
    run(typeof node.next === 'function' ? node.next(st.answers, st.answers[node.id]) : node.next);
  }

  async function findByEmail(email) {
    try {
      const res = await fetch('/api/find', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, sid: st.sid }) });
      if (!res.ok) return false;
      const j = await res.json();
      if (!j || !j.session || j.session.sid === st.sid || !j.session.step || j.session.step === 'email' || j.session.step === 'prenom') return false;
      const prev = j.session;
      await botSay(`Je te reconnais ! Tu avais ${prev.done ? 'déjà répondu' : 'commencé une fois'}. ${prev.done ? 'Tu veux recommencer ?' : 'On reprend là où tu en étais ?'}`);
      pending = { node: { id: 'resume' }, kind: 'choice' };
      showChoices({ id: 'resume' }, prev.done ? [{ k: 'R', t: 'Recommencer' }, { k: 'N', t: 'Non, c\'est bon' }] : [{ k: 'Y', t: 'Reprendre' }, { k: 'R', t: 'Recommencer' }]);
      composer('none');
      // interception : les boutons appellent answer(...) ; on redirige
      pending.box.querySelectorAll('button').forEach(b => b.onclick = () => {
        pending.box.remove(); bubble('me', b.textContent); pending = null;
        if (b.dataset.k === 'Y') { const log = st.log; st = prev; st.log = log.concat([{ who: 'sys', text: '(reprise)', t: Date.now() }]); persist(); run(st.step); }
        else if (b.dataset.k === 'R') { const keep = { prenom: st.prenom, email: st.email }; st = Object.assign(fresh(), keep); persist(); run('c1'); }
        else { st.done = 'done'; persist(); botSay('Merci encore, et à bientôt !'); composer('none'); }
      });
      return true;
    } catch (e) { return false; }
  }

  // ---- saisie
  form.addEventListener('submit', e => {
    e.preventDefault(); const text = input.value.trim(); if (!text || !pending) return; input.value = '';
    const node = pending.node;
    if (/^(stop|arr[êe]te|j'?arr[êe]te|quitter|au revoir)\s*[.!]?$/i.test(text)) { bubble('me', text); st.done = 'stopped'; persist(); botSay('Pas de souci, merci d\'avoir pris le temps. Le lien reste valable si tu veux reprendre.'); composer('none'); pending = null; return; }
    if (/^(passe|passer|je passe|suivant|skip)\s*[.!]?$/i.test(text)) { if (pending.box) pending.box.remove(); return skip(node); }
    if (pending.kind === 'free') {
      if (node.free === 'email') {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) { bubble('me', text); botSay('Hmm, ça ne ressemble pas à une adresse e-mail. Tu peux réessayer, ou passer.'); return; }
        return answer(node, text.toLowerCase(), text);
      }
      if (node.free === 'name') { const n = text.replace(/\s+/g, ' ').slice(0, 40); const cap = n.charAt(0).toUpperCase() + n.slice(1); return answer(node, cap, cap); }
      return answer(node, text, text);
    }
    // QCM : une lettre seule (« b », « B. ») vaut un clic
    const list = choicesOf(node); const m = text.match(/^([a-f])\s*[.)]?$/i);
    if (m && !node.multi) { const c = list.find(x => x.k === m[1].toUpperCase()); if (c) { if (pending.box) pending.box.remove(); return answer(node, c.k, c.t); } }
    freeOnChoice(node, text);
  });
  skipBtn.addEventListener('click', () => { if (pending) skip(pending.node); });

  // ---- démarrage
  async function boot() {
    composer('none');
    const url = new URLSearchParams(location.search);
    if (url.get('reset')) { st = fresh(); persist(); history.replaceState(null, '', location.pathname); }
    const begun = st.log.length && st.step && !['intro', 'intro2', 'start'].includes(st.step);
    if (begun) {
      replaying = true;
      hero(); st.log.forEach(m => { if (m.who !== 'sys') bubble(m.who, m.text); });
      replaying = false;
      if (st.done) {
        await botSay(`${st.prenom ? st.prenom + ', t' : 'T'}u as déjà répondu — merci ! Si tu veux refaire l'enquête, c'est ici.`);
        pending = { node: { id: 'again' }, kind: 'choice' };
        showChoices({ id: 'again' }, [{ k: 'R', t: 'Recommencer' }]);
        pending.box.querySelector('button').onclick = () => { pending.box.remove(); st = Object.assign(fresh(), { prenom: st.prenom, email: st.email }); persist(); chat.innerHTML = ''; hero(); run('c1'); };
        return;
      }
      await botSay(`Content de te revoir${st.prenom ? ' ' + st.prenom : ''} ! On reprend où on s'était arrêtés ?`);
      pending = { node: { id: 'resume' }, kind: 'choice' };
      showChoices({ id: 'resume' }, [{ k: 'Y', t: 'Reprendre' }, { k: 'R', t: 'Recommencer' }]);
      pending.box.querySelectorAll('button').forEach(b => b.onclick = () => {
        pending.box.remove(); bubble('me', b.textContent); pending = null;
        if (b.dataset.k === 'Y') run(st.step);
        else { st = Object.assign(fresh(), { prenom: st.prenom, email: st.email }); persist(); chat.innerHTML = ''; run(S.start); }
      });
      return;
    }
    run(S.start);
  }
  boot();
})();
