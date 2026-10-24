// moodbook · lecture et écriture du document InDesign (API UXP d'InDesign)
// Toutes les positions sont lues en coordonnées de planche, en points, sans toucher aux réglages du document.
(function (root) {
  'use strict';
  function makeDom(ID, uxp) {
    const { app } = ID;
    const E = ID; // enumerations (ContentType, Justification, …)
    const safe = (fn, d) => { try { const v = fn(); return v === undefined ? d : v; } catch (e) { return d; } };
    const els = c => { if (!c) return []; if (Array.isArray(c)) return c; try { return c.everyItem().getElements(); } catch (e) { const a = []; const n = safe(() => c.length, 0); for (let i = 0; i < n; i++) a.push(c.item(i)); return a; } };
    const cn = o => safe(() => o.constructorName, '') || safe(() => o.constructor.name, '');
    const eq = (a, b) => a === b || (a != null && b != null && String(a) === String(b));
    const r2 = n => Math.round(n * 100) / 100, r4 = n => Math.round(n * 10000) / 10000;
    const pathStr = x => typeof x === 'string' ? x : (x && (x.fsName || x.nativePath || x.fullName)) || (x ? String(x) : '');
    const FRAMES = ['Rectangle', 'Polygon', 'Oval'];
    const TEXT_SEL = ['InsertionPoint', 'Character', 'Word', 'Text', 'Paragraph', 'TextStyleRange', 'Line', 'TextColumn'];
    const DECOR = /\.(ai|eps|pdf|svg|indd|idms)$/i;
    // Fingerprint of a text as shown in the page preview: letters and digits only (same function on the site)
    function thash(s) { const t = String(s || '').normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, ''); return hash(t); }
    function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

    // ---------- documents ----------
    // The place of a document on disk. In InDesign's UXP API « fullName » is a Promise: it is resolved by refreshKeys()
    // (called at each tick of the panel) and kept here; never use String(promise) (« [object Promise] ») as a key.
    const keyCache = new Map();
    const isPromise = v => !!(v && typeof v.then === 'function');
    const untitled = d => 'sans-titre:' + safe(() => d.name, '') + ':' + safe(() => d.id, '');
    function docKey(d) {
      const id = safe(() => d.id, null); if (id != null && keyCache.has(id)) return keyCache.get(id);
      const v = safe(() => d.fullName, null); if (v && !isPromise(v)) { const k = pathStr(v); if (k && !/object Promise/.test(k)) return k; }
      return untitled(d);
    }
    async function refreshKeys(all) {
      const open = new Set();
      for (const d of els(app.documents)) {
        const id = safe(() => d.id, null); if (id == null) continue; open.add(id);
        if (!all && keyCache.has(id)) continue;
        let k = '';
        try { let v = d.fullName; if (isPromise(v)) v = await v; k = pathStr(v); } catch (e) { k = ''; }
        if (k && !/object Promise/.test(k)) keyCache.set(id, k); else keyCache.delete(id);   // never saved: « sans-titre »
      }
      for (const id of [...keyCache.keys()]) if (!open.has(id)) keyCache.delete(id);
    }
    function forgetKey(d) { const id = safe(() => d.id, null); if (id != null) keyCache.delete(id); }
    function activeDoc() { return safe(() => app.documents.length ? app.activeDocument : null, null); }
    function openDocKeys() { return els(app.documents).map(docKey); }
    const isModified = d => !!safe(() => d.modified, false);
    const docName = d => String(safe(() => d.name, '')).replace(/\.indd$/i, '');
    function readBinding(d) { try { const s = d.extractLabel('mb-book'); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
    function writeBinding(d, b) { d.insertLabel('mb-book', JSON.stringify(b)); }
    function readDocLabel(d) { try { const s = d.extractLabel('mb-doc'); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
    function writeDocLabel(d, v) { d.insertLabel('mb-doc', JSON.stringify(v)); }
    function clearLegacy(d) { if (safe(() => d.extractLabel('mb-book'), '')) d.insertLabel('mb-book', ''); }
    function clearBinding(d) { d.insertLabel('mb-book', ''); d.insertLabel('mb-doc', ''); }
    function findOpenDoc(path) { return els(app.documents).find(d => docKey(d) === path) || null; }
    function bringToFront(d) { try { app.activeDocument = d; } catch (e) { try { els(d.layoutWindows)[0].bringToFront(); } catch (e2) {} } }
    async function openDoc(path) {
      const lfs = uxp.storage && uxp.storage.localFileSystem; let entry = null;
      if (lfs && lfs.getEntryWithUrl) { for (const u of ['file:' + path, path]) { try { entry = await lfs.getEntryWithUrl(u); if (entry) break; } catch (e) {} } }
      try { return app.open(entry || path); } catch (e) { if (entry) return app.open(path); throw e; }
    }
    function activePage(d) { return safe(() => String(app.activeWindow.activePage.name), ''); }

    // ---------- geometry (spread coordinates, points) ----------
    const ANCH = () => [E.AnchorPoint.TOP_LEFT_ANCHOR, E.AnchorPoint.TOP_RIGHT_ANCHOR, E.AnchorPoint.BOTTOM_LEFT_ANCHOR, E.AnchorPoint.BOTTOM_RIGHT_ANCHOR];
    function box(o) {
      const xs = [], ys = [];
      for (const a of ANCH()) {
        const p = safe(() => o.resolve([a, E.BoundingBoxLimits.GEOMETRIC_PATH_BOUNDS], E.CoordinateSpaces.SPREAD_COORDINATES)[0], null)
          || safe(() => o.resolve(a, E.CoordinateSpaces.SPREAD_COORDINATES)[0], null);
        if (p) { xs.push(p[0]); ys.push(p[1]); }
      }
      if (!xs.length) { const g = o.geometricBounds; return { x1: g[1], y1: g[0], x2: g[3], y2: g[2] }; }
      return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
    }
    function unitFactor(d) {
      const u = safe(() => d.viewPreferences.horizontalMeasurementUnits, null);
      const M = E.MeasurementUnits || {};
      if (eq(u, M.MILLIMETERS)) return 72 / 25.4; if (eq(u, M.CENTIMETERS)) return 72 / 2.54; if (eq(u, M.INCHES) || eq(u, M.INCHES_DECIMAL)) return 72;
      if (eq(u, M.PICAS)) return 12; if (eq(u, M.CICEROS)) return 12.7889; return 1;
    }

    // ---------- what counts as a block ----------
    const onPage = it => !!safe(() => it.parentPage, null) && !eq(cn(safe(() => it.parentPage.parent, null)), 'MasterSpread');
    // Not printed in InDesign = not on the site: hidden item, hidden or non-printing layer, « non imprimable » attribute
    function shown(it) {
      if (safe(() => it.visible, true) === false || safe(() => it.nonprinting, false) === true) return false;
      const ly = safe(() => it.itemLayer, null); if (ly && (safe(() => ly.visible, true) === false || safe(() => ly.printable, true) === false)) return false;
      let p = safe(() => it.parent, null);
      for (let i = 0; p && i < 6 && cn(p) === 'Group'; i++) { if (safe(() => p.visible, true) === false || safe(() => p.nonprinting, false) === true) return false; p = safe(() => p.parent, null); }
      return true;
    }
    const anchored = it => eq(cn(safe(() => it.parent, null)), 'Character');
    function linkOf(fr) { return safe(() => { const g = els(fr.allGraphics)[0]; return g ? pathStr(g.itemLink.filePath) : ''; }, ''); }
    // Photo block or decoration? A choice made in the panel (« Sélection : décor / bloc photo ») always wins. Otherwise an
    // image from the book's photo folders, or the placeholder image, is a photo block; other PNG / PSD / TIFF / GIF
    // images (cut-outs, illustrations, cards) and vector files are decoration; other images (JPG, HEIC…) are photos.
    let curBook = null;
    const DECOR_IMG = /\.(png|psd|psb|gif|tiff?|bmp|webp)$/i;
    function inPhotos(ln, book) {
      if (!book) return false; const p = '/' + String(ln).replace(/\\/g, '/').toLowerCase();
      const names = [book.root, ...(book.folders || [])].filter(Boolean).map(n => '/' + String(n).toLowerCase() + '/');
      return names.some(n => p.includes(n));
    }
    function isPhotoFrame(it) {
      if (!FRAMES.includes(cn(it)) || anchored(it) || !onPage(it) || !shown(it)) return false;
      if (safe(() => it.extractLabel('mb-photo'), '')) return true;
      if (safe(() => it.extractLabel('mb-decor'), '')) return false;
      const ln = linkOf(it);
      if (ln) {
        if (DECOR.test(ln)) return false;
        const base = ln.replace(/\\/g, '/').split('/').pop().toLowerCase();
        if (curBook && (curBook.placeholders || []).includes(base)) return true;
        if (inPhotos(ln, curBook)) return true;
        return !DECOR_IMG.test(ln);
      }
      // Empty frame: a photo block only if it is a graphic frame without a colour fill (coloured shapes are decoration)
      if (!safe(() => eq(it.contentType, E.ContentType.GRAPHIC_TYPE), false)) return false;
      const fill = safe(() => it.fillColor, null); const fname = String(safe(() => fill && fill.name, '') || '');
      return !fill || /^(None|Aucun|Ninguno|Keine|Nessuno|Paper|Papier)$/i.test(fname) || !['Color', 'Tint', 'Gradient'].includes(cn(fill));
    }
    function storyOnlyGraphic(st) { return safe(() => els(st.allGraphics).length > 0 && String(st.contents).replace(/[\s\uFFFC]/g, '') === '', false); }
    function storyPage(st) {
      for (const tf of els(st.textContainers)) { if (anchored(tf)) return null; if (!shown(tf)) continue; const pg = safe(() => tf.parentPage, null); if (pg && onPage(tf)) return safe(() => pg.documentOffset, 0) + 1; }
      return null;
    }
    // Photo path as the site stores it: relative to the book folder (or « @dossier/… »), otherwise absolute
    function relPath(abs, book) {
      if (!abs) return null; const p = abs.replace(/\\/g, '/');
      const tryIn = (name, prefix) => { if (!name) return null; const k = '/' + name + '/'; const i = p.lastIndexOf(k); return i >= 0 ? prefix + p.slice(i + k.length) : null; };
      return tryIn(book && book.root, '') || (book && book.folders || []).slice(1).map(n => tryIn(n, '@' + n + '/')).find(Boolean) || ('abs:' + p);
    }
    function photoData(fr, book) {
      const abs = linkOf(fr); if (!abs) return { p: null, ln: null };
      const ln = abs.replace(/\\/g, '/').split('/').pop();
      if (book && (book.placeholders || []).includes(ln.toLowerCase())) return { p: null, ln: null };
      return { p: relPath(abs, book), ln };
    }

    // ---------- texts: paragraphs of runs {t, b, c} ----------
    const BOLD = /(bold|black|heavy|semibold|demi|gras)/i;
    function readParas(st) {
      const out = [];
      for (const para of els(st.paragraphs)) {
        const ps = safe(() => para.appliedParagraphStyle, null);
        const baseBold = BOLD.test(String(safe(() => ps.fontStyle, '') || ''));
        const baseCaps = safe(() => eq(ps.capitalization, E.Capitalization.ALL_CAPS), false);
        const just = safe(() => para.justification, null), sj = safe(() => ps.justification, null);
        let al = '';
        if (!eq(just, sj)) { if (eq(just, E.Justification.LEFT_ALIGN)) al = 'l'; else if (eq(just, E.Justification.RIGHT_ALIGN)) al = 'r'; }
        const runs = [];
        const pt = String(safe(() => para.contents, '') || ''); const pIdx = safe(() => para.index, null);
        const rs = els(para.textStyleRanges).map(r => ({ r, t: String(safe(() => r.contents, '') || ''), i: safe(() => r.index, null) }));
        let off = 0;
        if (rs.length && typeof pIdx === 'number' && typeof rs[0].i === 'number') off = pIdx - rs[0].i;
        else { const J = rs.map(x => x.t).join(''); off = Math.max(0, J.indexOf(pt)); }
        let pos = 0;
        for (const x of rs) {
          const r = x.r, a = pos, z = pos + x.t.length; pos = z;
          const sub = x.t.slice(Math.max(0, off - a), Math.max(0, Math.min(x.t.length, off + pt.length - a)));
          let t = sub.replace(/\r$/, '').replace(/\r/g, '').replace(/\u2028/g, '\n').replace(/[\uFEFF\uFFFC]/g, '');
          if (!t) continue;
          const b = BOLD.test(String(safe(() => r.fontStyle, ''))) && !baseBold;
          const c = safe(() => eq(r.capitalization, E.Capitalization.ALL_CAPS), false) && !baseCaps;
          runs.push(Object.assign({ t }, b ? { b: 1 } : {}, c ? { c: 1 } : {}));
        }
        out.push(Object.assign({ runs }, al ? { al } : {}));
      }
      return out;
    }
    const plain = p => (p.runs || []).map(r => r.t).join('');
    function setBold(story, from, to) {
      const ch = story.characters.item(from); const fam = safe(() => ch.appliedFont.fontFamily, null); if (!fam) return false;
      const cur = String(safe(() => ch.fontStyle, '')), want = /italic|oblique/i.test(cur) ? [' Italic', ''] : [''];
      for (const s of ['Bold', 'Semibold', 'SemiBold', 'Demi', 'Black', 'Heavy', 'Medium']) for (const w of want)
        if (safe(() => app.fonts.itemByName(fam + '\t' + s + w).isValid, false)) { story.characters.itemByRange(from, to).fontStyle = s + w; return true; }
      return false;
    }
    // Each paragraph keeps the formatting of the layout (its first character); bold, capitals and left/right alignment go on top
    function writeStory(story, paras) {
      paras = (paras || []).filter((p, i, a) => i < a.length - 1 || plain(p) || a.length === 1);
      if (!paras.length) paras = [{ runs: [] }];
      const n = paras.length;
      while (story.paragraphs.length < n) story.insertionPoints.lastItem().contents = '\r';
      if (story.paragraphs.length > n) {
        story.paragraphs.itemByRange(n, story.paragraphs.length - 1).remove();
        const last = story.characters.lastItem(); if (safe(() => last.isValid, false) && last.contents === '\r') last.remove();
      }
      for (let i = n - 1; i >= 0; i--) {
        const p = story.paragraphs.item(i), L = p.characters.length, endsCR = L > 0 && p.characters.item(L - 1).contents === '\r', vis = endsCR ? L - 1 : L, txt = plain(paras[i]).replace(/\n/g, '\u2028');
        if (vis === 0) { if (txt) p.insertionPoints.item(0).contents = txt; }
        else { if (vis > 1) p.characters.itemByRange(1, vis - 1).remove(); if (txt) p.characters.item(0).contents = txt; else p.characters.item(0).remove(); }
      }
      for (let i = 0; i < n; i++) {
        const para = story.paragraphs.item(i), P = paras[i]; if (!para.characters.length) continue;
        const start = para.characters.item(0).index; let off = 0;
        const sj = safe(() => para.appliedParagraphStyle.justification, null);
        if (P.al === 'l') para.justification = E.Justification.LEFT_ALIGN; else if (P.al === 'r') para.justification = E.Justification.RIGHT_ALIGN; else if (sj) safe(() => { para.justification = sj; });
        for (const run of P.runs || []) {
          const len = String(run.t).length;
          if (len && run.b) setBold(story, start + off, start + off + len - 1);
          if (len && run.c) story.characters.itemByRange(start + off, start + off + len - 1).capitalization = E.Capitalization.ALL_CAPS;
          off += len;
        }
      }
    }

    // ---------- blocks ----------
    function allSpreads(d) { return els(d.spreads); }
    function photoFrames(d) { const out = []; for (const sp of allSpreads(d)) for (const it of els(sp.allPageItems)) if (isPhotoFrame(it)) out.push(it); return out; }
    function stories(d) { return els(d.stories).filter(st => !storyOnlyGraphic(st) && storyPage(st)); }
    function readBlocks(d, opt) {
      const out = [], cache = opt.cache || {}, only = opt.only ? new Set(opt.only) : null, book = opt.root; if (book) curBook = book;
      for (const fr of photoFrames(d)) {
        const bid = 'f' + fr.id; if (only && !only.has(bid)) continue;
        const ln = linkOf(fr); if (!opt.full && !only && cache[bid] === ln) continue; cache[bid] = ln;
        out.push({ bid, kind: 'ph', page: safe(() => fr.parentPage.documentOffset, 0) + 1, data: photoData(fr, book) });
      }
      for (const st of stories(d)) {
        const bid = 's' + st.id; if (only && !only.has(bid)) continue;
        const txt = String(safe(() => st.contents, '')); if (!opt.full && !only && cache[bid] === txt) continue; cache[bid] = txt;
        out.push({ bid, kind: 'tx', page: storyPage(st), data: { paras: readParas(st) } });
      }
      return out;
    }
    // Folder of the book photos on this computer, found from the photos already placed in the document
    const folderCache = {};
    function folderAbs(d, name) {
      if (folderCache[name]) return folderCache[name];
      for (const fr of photoFrames(d)) { const p = linkOf(fr).replace(/\\/g, '/'); const i = p.lastIndexOf('/' + name + '/'); if (i >= 0) return (folderCache[name] = p.slice(0, i + name.length + 1)); }
      return null;
    }
    function absPath(d, p, book) {
      if (!p) return null; if (p.startsWith('abs:')) return p.slice(4);
      if (p.charAt(0) === '@') { const cut = p.indexOf('/'); const name = p.slice(1, cut); const base = folderAbs(d, name); return base ? base + '/' + p.slice(cut + 1) : null; }
      const base = book && book.root ? folderAbs(d, book.root) : null; return base ? base + '/' + p : null;
    }
    // Placing a file: InDesign's UXP API wants a file entry (a plain path gives « Impossible de créer la ressource de lien à partir de l'URI donné »)
    async function entryOf(abs) {
      const lfs = uxp.storage && uxp.storage.localFileSystem; if (!lfs || !lfs.getEntryWithUrl) return null;
      for (const u of ['file:' + abs, 'file://' + encodeURI(abs), abs]) { try { const e = await lfs.getEntryWithUrl(u); if (e) return e; } catch (e) { /* next form */ } }
      return null;
    }
    // What a file really is, from its first bytes (WhatsApp and phones sometimes give a .jpg that is something else)
    function sniff(b) {
      if (b[0] === 0xFF && b[1] === 0xD8) return 'jpeg';
      if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
      if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
      if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) { const brand = String.fromCharCode(b[8], b[9], b[10], b[11]); return /avif|avis/.test(brand) ? 'avif' : 'heic'; }
      return 'inconnu';
    }
    const FMT = { webp: 'WebP', heic: 'HEIC', avif: 'AVIF', png: 'PNG', inconnu: 'inconnu' };
    // InDesign refuses some JPEG files (WhatsApp, progressive or slightly damaged ones): the panel decodes the photo itself and
    // saves a clean copy (baseline JPEG, quality 92) next to it, « <nom>_converted.jpg », then places that copy. The original is not touched.
    async function convertJpeg(abs, entry) {
      const J = (typeof MBJpeg !== 'undefined' && MBJpeg) || (typeof globalThis !== 'undefined' && globalThis.MBJpeg) || null;
      if (!J) throw new Error('module de conversion absent du panneau');
      const bytes = new Uint8Array(await entry.read({ format: uxp.storage.formats.binary }));
      const kind = sniff(bytes);
      if (kind !== 'jpeg') throw new Error('ce fichier n\'est pas un vrai JPEG mais une image ' + FMT[kind] + ' : ouvrez-la dans Aperçu (Fichier › Exporter › JPEG) puis replacez-la');
      let img;
      const opts = { useTArray: true, formatAsRGBA: true, tolerantDecoding: true, maxResolutionInMP: 250, maxMemoryUsageInMB: 2048 };
      try { img = J.decode(bytes, opts); }
      catch (e) {
        // A cut-off file (transfer interrupted, WhatsApp): close it with an end marker and read what is there
        let ok = false;
        if (!(bytes[bytes.length - 2] === 0xFF && bytes[bytes.length - 1] === 0xD9)) {
          let end = bytes.length; while (end > 2 && bytes[end - 1] === 0) end--;
          const fixed = new Uint8Array(end + 2); fixed.set(bytes.subarray(0, end)); fixed[end] = 0xFF; fixed[end + 1] = 0xD9;
          try { img = J.decode(fixed, opts); ok = true; } catch (e2) { /* still unreadable */ }
        }
        if (!ok) throw new Error('photo illisible, même pour le panneau (' + (e.message || e) + ')');
      }
      const out = J.encode({ data: img.data, width: img.width, height: img.height }, 92).data;
      const slash = abs.lastIndexOf('/'); const dir = abs.slice(0, slash); const name = abs.slice(slash + 1).replace(/\.[^.]+$/, '') + '_converted.jpg';
      const folder = await entryOf(dir); if (!folder || !folder.createFile) throw new Error('impossible d\'écrire dans le dossier de la photo');
      const file = await folder.createFile(name, { overwrite: true });
      await file.write(out.buffer ? out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) : out, { format: uxp.storage.formats.binary });
      return { entry: file, path: dir + '/' + name, w: img.width, h: img.height };
    }
    async function placeFile(fr, abs) {
      let entry = await entryOf(abs), firstErr = null;
      try { fr.place(entry || abs); return null; } catch (e) { firstErr = e; }
      if (!entry) throw new Error('fichier introuvable : ' + abs);
      if (!/\.(jpe?g|jfif)$/i.test(abs)) throw new Error(abs + ' (' + (firstErr.message || firstErr) + ')');
      // A copy converted earlier is reused
      const copy = abs.replace(/\.[^.]+$/, '') + '_converted.jpg'; const had = await entryOf(copy);
      if (had) { try { fr.place(had); return { path: copy, reused: true }; } catch (e) { /* convert again */ } }
      const c = await convertJpeg(abs, entry);
      fr.place(c.entry);
      return { path: c.path, w: c.w, h: c.h };
    }
    // « Placer une photo refusée… » : the selected frame receives a photo chosen on disk, converted if InDesign refuses it
    async function pickAndPlace(d) {
      const sel = safe(() => els(app.selection), []).map(x => FRAMES.includes(cn(x)) ? x : safe(() => x.parent, null)).find(f => f && FRAMES.includes(cn(f)));
      if (!sel) throw new Error('sélectionnez d\'abord le bloc image dans InDesign');
      const lfs = uxp.storage.localFileSystem; const f = await lfs.getFileForOpening({ types: ['jpg', 'jpeg', 'jfif', 'JPG', 'JPEG'] });
      if (!f) return null;
      const abs = f.nativePath; const conv = await placeFile(sel, abs);
      safe(() => sel.fit(E.FitOptions.FILL_PROPORTIONALLY)); safe(() => sel.fit(E.FitOptions.CENTER_CONTENT));
      return { name: abs.split('/').pop(), converted: conv ? conv.path : null };
    }
    async function writeBlock(d, blk, data, book) {
      if (blk.kind === 'tx') {
        const st = d.stories.itemByID(+String(blk.bid).slice(1)); if (!safe(() => st.isValid, true)) throw new Error('texte introuvable');
        writeStory(st, (data && data.paras) || []); return;
      }
      const fr = findFrame(d, +String(blk.bid).slice(1)); if (!fr) throw new Error('bloc photo introuvable');
      if (!data || !data.p) { for (const g of els(fr.allGraphics)) safe(() => g.remove()); return; }
      const abs = absPath(d, data.p, book); if (!abs) throw new Error('dossier photos introuvable pour « ' + data.p + ' »');
      const conv = await placeFile(fr, abs);
      safe(() => fr.fit(E.FitOptions.FILL_PROPORTIONALLY)); safe(() => fr.fit(E.FitOptions.CENTER_CONTENT));
      return conv ? { converted: conv.path, reused: !!conv.reused } : null;
    }
    function findFrame(d, id) { for (const sp of allSpreads(d)) for (const it of els(sp.allPageItems)) if (it.id === id) return it; return null; }
    // « Sélection : décor / bloc photo » : the selected image frames switch between photo block and decoration
    function toggleKind(d, book) {
      if (book) curBook = book;
      const frames = safe(() => els(app.selection), []).map(s => FRAMES.includes(cn(s)) ? s : safe(() => s.parent, null)).filter(f => f && FRAMES.includes(cn(f)));
      let toDecor = 0, toPhoto = 0;
      for (const f of frames) {
        if (isPhotoFrame(f)) { f.insertLabel('mb-photo', ''); f.insertLabel('mb-decor', '1'); toDecor++; }
        else { f.insertLabel('mb-decor', ''); f.insertLabel('mb-photo', '1'); toPhoto++; }
      }
      return { toDecor, toPhoto };
    }
    function selectionBid(d) {
      const s = safe(() => els(app.selection), []).length ? safe(() => app.selection[0], null) : null; if (!s) return null;
      const k = cn(s);
      if (TEXT_SEL.includes(k) || k === 'TextFrame') { const st = safe(() => s.parentStory, null); return st ? 's' + st.id : null; }
      let fr = s; if (!FRAMES.includes(k)) fr = safe(() => s.parent, null);
      return fr && FRAMES.includes(cn(fr)) ? 'f' + fr.id : null;
    }

    // ---------- structure for the site: pages, blocks, styles ----------
    function color(c, tint) {
      return safe(() => {
        if (!c) return null; let t = tint == null || tint < 0 ? 100 : tint;
        if (cn(c) === 'Tint') { t = c.tintValue; c = c.baseColor; }
        if (cn(c) !== 'Color') return null;
        if (/^(Paper|Papier)$/.test(String(c.name))) return { s: 'r', v: [255, 255, 255], t: 100 };
        const sp = eq(c.space, E.ColorSpace.RGB) ? 'r' : eq(c.space, E.ColorSpace.LAB) ? 'l' : 'c';
        return { s: sp, v: c.colorValue.map(r2), t };
      }, null);
    }
    const JUST = [['LEFT_ALIGN', 'l'], ['CENTER_ALIGN', 'c'], ['RIGHT_ALIGN', 'r'], ['LEFT_JUSTIFIED', 'j'], ['CENTER_JUSTIFIED', 'jc'], ['RIGHT_JUSTIFIED', 'jr'], ['FULLY_JUSTIFIED', 'jf'], ['TO_BINDING_SIDE', 'b'], ['AWAY_FROM_BINDING_SIDE', 'a']];
    const just = v => { for (const [k, s] of JUST) if (eq(v, E.Justification[k])) return s; return 'l'; };
    function styleOf(p) {
      const sz = safe(() => p.pointSize, 10); let ld = safe(() => p.leading, null); if (typeof ld !== 'number') ld = sz * safe(() => p.autoLeading, 120) / 100;
      return { st: safe(() => String(p.appliedParagraphStyle.name), ''), ff: safe(() => String(p.appliedFont.fontFamily), ''), fs: safe(() => String(p.fontStyle), 'Regular'),
        sz: r2(sz), ld: r2(ld), al: just(safe(() => p.justification, null)), col: color(safe(() => p.fillColor, null), safe(() => p.fillTint, -1)),
        caps: safe(() => eq(p.capitalization, E.Capitalization.ALL_CAPS), false) ? 'all' : safe(() => eq(p.capitalization, E.Capitalization.SMALL_CAPS), false) ? 'small' : '',
        tr: safe(() => p.tracking, 0), sb: r2(safe(() => p.spaceBefore, 0)), sa: r2(safe(() => p.spaceAfter, 0)), fi: r2(safe(() => p.firstLineIndent, 0)), li: r2(safe(() => p.leftIndent, 0)), ri: r2(safe(() => p.rightIndent, 0)),
        t: String(safe(() => p.contents, '')).replace(/\r$/, '').slice(0, 400) };
    }
    function shapeOf(it) {
      if (cn(it) === 'Oval') return { sh: 'ov' };
      return safe(() => {
        const paths = els(it.paths); if (paths.length !== 1) return {};
        const g = it.geometricBounds, w = g[3] - g[1], h = g[2] - g[0]; let axis = true; const pts = [];
        for (let p of paths[0].entirePath) { if (Array.isArray(p[0])) p = p[1]; const x = (p[0] - g[1]) / w, y = (p[1] - g[0]) / h; if (!((Math.abs(x) < .002 || Math.abs(x - 1) < .002) && (Math.abs(y) < .002 || Math.abs(y - 1) < .002))) axis = false; pts.push([r4(x), r4(y)]); }
        return axis && pts.length === 4 ? {} : { sh: 'poly', pts };
      }, {});
    }
    function readStructure(d, book) {
      if (book) curBook = book;
      const k = unitFactor(d), pages = [], storiesOut = {};
      const okList = stories(d); const okStories = new Set(okList.map(st => st.id));
      const textOf = new Map(); const storyText = sid => { if (!textOf.has(sid)) { const st = okList.find(x => String(x.id) === String(sid)); textOf.set(sid, st ? String(safe(() => st.contents, '') || '') : ''); } return textOf.get(sid); };
      for (const sp of allSpreads(d)) {
        const pgs = els(sp.pages); const pb = pgs.map(box); const items = els(sp.allPageItems); const N = items.length;
        const per = pgs.map(() => []);
        items.forEach((it, idx) => {
          const kind = isPhotoFrame(it) ? 'ph' : (cn(it) === 'TextFrame' && !anchored(it) && okStories.has(safe(() => it.parentStory.id, -1))) ? 'tx' : null;
          if (!kind || !shown(it)) return;
          const b = box(it); let pi = -1;
          for (let q = 0; q < pb.length; q++) if (Math.min(b.x2, pb[q].x2) - Math.max(b.x1, pb[q].x1) > .5 && Math.min(b.y2, pb[q].y2) - Math.max(b.y1, pb[q].y1) > .5) { pi = q; break; } // straddling: left page
          if (pi < 0) return;
          const P = pb[pi], W = P.x2 - P.x1, H = P.y2 - P.y1;
          const f = { fid: it.id, k: kind, x: r4((b.x1 - P.x1) / W), y: r4((b.y1 - P.y1) / H), w: r4((b.x2 - b.x1) / W), h: r4((b.y2 - b.y1) / H), z: N - idx };
          const rot = safe(() => it.rotationAngle, 0); if (rot) f.r = r2(rot);
          Object.assign(f, shapeOf(it));
          const bg = color(safe(() => it.fillColor, null), safe(() => it.fillTint, -1)); if (bg) f.bg = bg;
          const sw = safe(() => it.strokeWeight, 0); if (sw) { const sc = color(safe(() => it.strokeColor, null), safe(() => it.strokeTint, -1)); if (sc) f.sk = { w: r2(sw), c: sc }; }
          if (kind === 'ph') {
            f.bid = 'f' + it.id;
            // which image the preview shows in this block, and how it sits in it (crop, scale): part of the page signature
            f.ln = linkOf(it).replace(/\\/g, '/').split('/').pop().toLowerCase();
            const g = safe(() => els(it.allGraphics)[0], null); const gb = g ? safe(() => g.geometricBounds, null) : null;
            if (Array.isArray(gb)) f.gc = gb.map(v => Math.round(v * 10) / 10).join(',');
          }
          else {
            const st = it.parentStory, sid = String(st.id); f.bid = 's' + sid; f.st = sid;
            f.ci = Math.max(0, els(st.textContainers).findIndex(x => x.id === it.id));
            const tp = it.textFramePreferences; f.cols = safe(() => tp.textColumnCount, 1); f.gut = r2(safe(() => tp.textColumnGutter, 12) * k);
            const ins = safe(() => tp.insetSpacing, 0); f.ins = Array.isArray(ins) ? ins.map(v => r2(v * k)) : [0, 0, 0, 0].map(() => r2((ins || 0) * k));
            const vj = safe(() => tp.verticalJustification, null); f.vj = eq(vj, E.VerticalJustification.CENTER_ALIGN) ? 'c' : eq(vj, E.VerticalJustification.BOTTOM_ALIGN) ? 'b' : eq(vj, E.VerticalJustification.JUSTIFY_ALIGN) ? 'j' : 't';
            if (!storiesOut[sid]) storiesOut[sid] = { paras: els(st.paragraphs).slice(0, 40).map(styleOf), n: els(st.textContainers).length };
          }
          per[pi].push(f);
        });
        pgs.forEach((pg, q) => {
          const n = safe(() => pg.documentOffset, 0) + 1; const P = pb[q];
          const side = pgs.length >= 2 ? (q === 0 ? 'l' : 'r') : (safe(() => eq(pg.side, E.PageSideOptions.LEFT_HAND), false) ? 'l' : 'r');
          const frames = per[q]; const th = {}, pf = {};
          for (const f of frames) if (f.k === 'tx' && !(f.st in th)) th[f.st] = thash(storyText(f.st));
          for (const f of frames) if (f.k === 'ph') pf[f.bid] = f.ln || '';
          const sig = hash(JSON.stringify(frames.map(f => [f.bid, f.x, f.y, f.w, f.h, f.z, f.sh || '', f.cols || '', f.ln || '', f.gc || ''])) + JSON.stringify(th) + (P.x2 - P.x1) + 'x' + (P.y2 - P.y1));
          frames.forEach(f => { delete f.gc; delete f.ln; });
          pages.push({ n, name: safe(() => String(pg.name), String(n)), side, w: r2(P.x2 - P.x1), h: r2(P.y2 - P.y1), frames, sig, th, pf });
        });
      }
      return { pages, stories: storiesOut };
    }
    // Page preview (photos and decoration, without the text frames that the site draws itself)
    async function exportPreview(d, pg, withText) {
      const page = d.pages.item(pg.n - 1); const hidden = [];
      if (!withText) for (const it of els(page.allPageItems)) if (cn(it) === 'TextFrame' && safe(() => it.visible, false)) { safe(() => { it.visible = false; hidden.push(it); }); }
      const jp = app.jpegExportPreferences; const keys = ['exportingSpread', 'jpegExportRange', 'pageString', 'jpegQuality', 'exportResolution', 'jpegColorSpace', 'antiAlias']; const saved = {};
      keys.forEach(k => { saved[k] = safe(() => jp[k], undefined); });
      const lfs = uxp.storage.localFileSystem; const tmp = await lfs.getTemporaryFolder(); const name = 'mb-page-' + pg.n + (withText ? '' : '-fond') + '.jpg';
      try {
        jp.exportingSpread = false; jp.jpegExportRange = E.ExportRangeOrAllPages.EXPORT_RANGE; jp.pageString = '+' + pg.n;
        safe(() => { jp.jpegQuality = E.JPEGOptionsQuality.MEDIUM; }); safe(() => { jp.exportResolution = 60; }); safe(() => { jp.jpegColorSpace = E.JpegColorSpaceEnum.RGB; }); safe(() => { jp.antiAlias = true; });
        d.exportFile(E.ExportFormat.JPG, tmp.nativePath + '/' + name, false);
      } finally {
        hidden.forEach(it => safe(() => { it.visible = true; }));
        keys.forEach(k => { if (saved[k] !== undefined) safe(() => { jp[k] = saved[k]; }); });
      }
      const f = await tmp.getEntry(name); const buf = await f.read({ format: uxp.storage.formats.binary });
      return 'data:image/jpeg;base64,' + b64(new Uint8Array(buf));
    }
    function b64(u8) {
      const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let s = '', i = 0;
      for (; i + 2 < u8.length; i += 3) { const n = (u8[i] << 16) | (u8[i + 1] << 8) | u8[i + 2]; s += A[n >> 18 & 63] + A[n >> 12 & 63] + A[n >> 6 & 63] + A[n & 63]; }
      if (i < u8.length) { const n = (u8[i] << 16) | ((i + 1 < u8.length ? u8[i + 1] : 0) << 8); s += A[n >> 18 & 63] + A[n >> 12 & 63] + (i + 1 < u8.length ? A[n >> 6 & 63] : '=') + '='; }
      return s;
    }
    return { activeDoc, openDocKeys, docKey, refreshKeys, forgetKey, thash, isModified, docName, readBinding, writeBinding, clearBinding, readDocLabel, writeDocLabel, clearLegacy, findOpenDoc, bringToFront, openDoc, toggleKind, pickAndPlace, pageCount: d => els(d.pages).length, activePage, readBlocks, writeBlock, selectionBid, readStructure, exportPreview, relPath, b64 };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { makeDom }; else root.MBDom = { makeDom };
})(typeof window !== 'undefined' ? window : globalThis);
