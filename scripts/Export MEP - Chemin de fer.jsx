// Chemin de fer - conception livre : export des mises en page d'un fichier MEP
// Installation : Fenêtre > Utilitaires > Scripts, clic droit sur « Utilisateur » > Faire apparaître dans le Finder,
// copiez ce fichier dans ce dossier. Ouvrez le fichier MEP, puis double-cliquez sur le script dans le panneau Scripts.
// Le script crée, à côté du fichier, un dossier « <nom du fichier> - export MEP » contenant :
//   - mep.json : chaque page = une mise en page (blocs photo, blocs texte, formes, superpositions, chaînages, colonnes, styles)
//   - un aperçu basse définition de chaque page (complet, et sans les blocs pour l'application)
// Glissez ensuite ce dossier sur le livre voulu dans l'application (onglet Mises en page).
// Le document n'est pas modifié (les blocs masqués le temps de l'aperçu sont réaffichés).
#target indesign
(function () {
  if (app.documents.length === 0) { alert("Ouvrez d'abord le fichier MEP dans InDesign."); return; }
  var doc = app.activeDocument;
  var docName = String(decodeURI(doc.name)).replace(/\.indd$/i, "");
  if (!/MEP/i.test(docName) && !confirm("« " + docName + " » n'a pas « MEP » dans son nom.\nL'exporter quand même comme fichier de mises en page ?")) return;

  // ---------- small helpers (ExtendScript has no JSON nor Array.indexOf) ----------
  function has(a, v) { for (var i = 0; i < a.length; i++) if (a[i] === v) return true; return false; }
  function r4(n) { return Math.round(n * 10000) / 10000; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function J(v) {
    if (v === null || v === undefined) return "null";
    var t = typeof v;
    if (t === "number") return isFinite(v) ? String(v) : "null";
    if (t === "boolean") return v ? "true" : "false";
    if (t === "string") {
      var s = "\"";
      for (var i = 0; i < v.length; i++) {
        var c = v.charAt(i), k = v.charCodeAt(i);
        if (c === "\"") s += "\\\""; else if (c === "\\") s += "\\\\";
        else if (k === 13) s += "\\r"; else if (k === 10) s += "\\n"; else if (k === 9) s += "\\t";
        else if (k < 32 || k > 126) { var h = k.toString(16); while (h.length < 4) h = "0" + h; s += "\\u" + h; }
        else s += c;
      }
      return s + "\"";
    }
    if (v instanceof Array) { var a = []; for (var j = 0; j < v.length; j++) a.push(J(v[j])); return "[" + a.join(",") + "]"; }
    var o = [];
    for (var key in v) if (v.hasOwnProperty(key) && v[key] !== undefined) o.push(J(key) + ":" + J(v[key]));
    return "{" + o.join(",") + "}";
  }
  function safe(fn, dflt) { try { var r = fn(); return r === undefined ? dflt : r; } catch (e) { return dflt; } }

  // ---------- where to write ----------
  var base = safe(function () { return doc.filePath; }, null);
  if (!base) { base = Folder.selectDialog("Ce document n'est pas encore enregistré. Choisissez où créer le dossier d'export"); if (!base) return; }
  var out = new Folder(base.fsName + "/" + docName + " - export MEP");
  if (!out.exists && !out.create()) { alert("Impossible de créer le dossier :\n" + out.fsName); return; }
  var old = out.getFiles("*.jpg"); for (var oi = 0; oi < old.length; oi++) safe(function () { old[oi].remove(); });

  // ---------- which images mark the photo blocks (the fixed placeholder image) ----------
  var linkCount = {}, linkNames = [];
  function linkOf(fr) { return safe(function () { var g = fr.allGraphics; return g.length ? String(decodeURI(g[0].itemLink.name)) : ""; }, ""); }
  var allFrames = doc.allPageItems;
  for (var ai = 0; ai < allFrames.length; ai++) {
    var it0 = allFrames[ai];
    if (!(it0 instanceof Rectangle || it0 instanceof Polygon || it0 instanceof Oval || it0 instanceof TextFrame)) continue;
    var ln = linkOf(it0); if (!ln) continue;
    if (!linkCount[ln]) { linkCount[ln] = 0; linkNames.push(ln); } linkCount[ln]++;
  }
  linkNames.sort(function (a, b) { return linkCount[b] - linkCount[a]; });
  var remembered = safe(function () { return doc.extractLabel("cdf-placeholders"); }, "");
  var placeholders = [];
  if (linkNames.length) {
    var dlg = new Window("dialog", "Images témoin des blocs photo");
    dlg.orientation = "column"; dlg.alignChildren = ["fill", "top"]; dlg.margins = 14; dlg.spacing = 8;
    dlg.add("statictext", undefined, "Cochez l'image (ou les images) que vous placez dans les blocs photo de vos mises en page. Les autres images restent du décor.", { multiline: true }).preferredSize = [420, 36];
    var boxes = [], list = dlg.add("panel"); list.alignChildren = ["left", "top"]; list.margins = 10;
    for (var li = 0; li < linkNames.length && li < 20; li++) {
      var cb = list.add("checkbox", undefined, linkNames[li] + "  (" + linkCount[linkNames[li]] + " bloc" + (linkCount[linkNames[li]] > 1 ? "s" : "") + ")");
      cb.value = remembered ? has(remembered.split("\n"), linkNames[li]) : li === 0;
      boxes.push(cb);
    }
    var bg_ = dlg.add("group"); bg_.alignment = ["right", "top"];
    bg_.add("button", undefined, "Annuler", { name: "cancel" }); bg_.add("button", undefined, "Exporter", { name: "ok" });
    if (dlg.show() !== 1) return;
    for (var bi = 0; bi < boxes.length; bi++) if (boxes[bi].value) placeholders.push(linkNames[bi]);
    safe(function () { doc.insertLabel("cdf-placeholders", placeholders.join("\n")); });
  }

  // ---------- measurements: points, spread origin ----------
  var vp = doc.viewPreferences;
  var saved = { h: vp.horizontalMeasurementUnits, v: vp.verticalMeasurementUnits, ro: vp.rulerOrigin, zp: doc.zeroPoint };
  var jp = app.jpegExportPreferences, jSaved = {};
  var JP_KEYS = ["exportingSpread", "jpegExportRange", "pageString", "jpegQuality", "exportResolution", "jpegColorSpace", "antiAlias", "useDocumentBleeds", "simulateOverprint"];
  for (var jk = 0; jk < JP_KEYS.length; jk++) jSaved[JP_KEYS[jk]] = safe(function () { return jp[JP_KEYS[jk]]; }, undefined);
  var hidden = [];
  var progress = new Window("palette", "Export MEP"); progress.margins = 14;
  var pText = progress.add("statictext", undefined, "Lecture des pages…"); pText.preferredSize = [360, 18];
  var pBar = progress.add("progressbar", undefined, 0, Math.max(1, doc.pages.length * 3)); pBar.preferredSize = [360, 8];
  progress.show();
  var result = { app: "cdf-mep", v: 1, doc: docName, at: new Date().toString(), ph: placeholders, pages: [], stories: {} };
  var nPh = 0, nTx = 0;

  var JUST = [["LEFT_ALIGN", "l"], ["CENTER_ALIGN", "c"], ["RIGHT_ALIGN", "r"], ["LEFT_JUSTIFIED", "j"], ["CENTER_JUSTIFIED", "jc"], ["RIGHT_JUSTIFIED", "jr"], ["FULLY_JUSTIFIED", "jf"], ["TO_BINDING_SIDE", "b"], ["AWAY_FROM_BINDING_SIDE", "a"]];
  function just(v) { for (var i = 0; i < JUST.length; i++) if (safe(function () { return v == Justification[JUST[i][0]]; }, false)) return JUST[i][1]; return "l"; }
  function color(c, tint) {
    return safe(function () {
      if (!c) return null;
      var t = (tint === undefined || tint < 0) ? 100 : tint;
      if (safe(function () { return c instanceof Tint; }, false)) { t = c.tintValue; c = c.baseColor; }
      if (!safe(function () { return c instanceof Color; }, false)) return null;                 // None, gradients, mixed inks
      if (/^(Paper|Papier)$/.test(String(c.name))) return { s: "r", v: [255, 255, 255], t: 100 };
      var sp = c.space == ColorSpace.CMYK ? "c" : c.space == ColorSpace.RGB ? "r" : c.space == ColorSpace.LAB ? "l" : "c";
      var v = c.colorValue, o = []; for (var i = 0; i < v.length; i++) o.push(r2(v[i]));
      return { s: sp, v: o, t: t };
    }, null);
  }
  function capsOf(p) { return safe(function () { return p.capitalization == Capitalization.ALL_CAPS ? "all" : p.capitalization == Capitalization.SMALL_CAPS ? "small" : (p.capitalization == Capitalization.CAP_TO_SMALL_CAP ? "small" : ""); }, ""); }
  function paraInfo(p) {
    var sz = safe(function () { return p.pointSize; }, 10), ld = safe(function () { return p.leading; }, null);
    if (typeof ld !== "number") ld = sz * safe(function () { return p.autoLeading; }, 120) / 100;
    var txt = safe(function () { return String(p.contents); }, "");
    return {
      st: safe(function () { return String(p.appliedParagraphStyle.name); }, ""),
      ff: safe(function () { return String(p.appliedFont.fontFamily); }, safe(function () { return String(p.appliedFont).split("\t")[0]; }, "")),
      fs: safe(function () { return String(p.fontStyle); }, "Regular"),
      sz: r2(sz), ld: r2(ld), al: just(safe(function () { return p.justification; }, null)),
      col: color(safe(function () { return p.fillColor; }, null), safe(function () { return p.fillTint; }, -1)),
      caps: capsOf(p), tr: safe(function () { return p.tracking; }, 0),
      sb: r2(safe(function () { return p.spaceBefore; }, 0)), sa: r2(safe(function () { return p.spaceAfter; }, 0)),
      fi: r2(safe(function () { return p.firstLineIndent; }, 0)), li: r2(safe(function () { return p.leftIndent; }, 0)), ri: r2(safe(function () { return p.rightIndent; }, 0)),
      t: txt.replace(/\r$/, "").substr(0, 1500)
    };
  }
  function storyInfo(story) {
    var ps = story.paragraphs, out_ = [], total = 0;
    for (var i = 0; i < ps.length && i < 40 && total < 6000; i++) { var pi = paraInfo(ps[i]); total += pi.t.length; out_.push(pi); }
    return { paras: out_, n: safe(function () { return story.textContainers.length; }, 1) };
  }
  function isOnlyGraphic(tf) {
    return safe(function () { return tf.parentStory.allGraphics.length > 0 && String(tf.parentStory.contents).replace(/[\s￼]/g, "") === ""; }, false);
  }
  function shapeOf(it, gb) {
    if (it instanceof Oval) return { sh: "ov" };
    return safe(function () {
      if (it.paths.length !== 1) return {};
      var pts = it.paths[0].entirePath, w = gb[3] - gb[1], h = gb[2] - gb[0], o = [], axis = true;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i]; if (p[0] instanceof Array) p = p[1]; // curved point: [left, anchor, right]
        var x = (p[0] - gb[1]) / w, y = (p[1] - gb[0]) / h;
        if (!((Math.abs(x) < .002 || Math.abs(x - 1) < .002) && (Math.abs(y) < .002 || Math.abs(y - 1) < .002))) axis = false;
        o.push([r4(x), r4(y)]);
      }
      return (axis && o.length === 4) ? {} : { sh: "poly", pts: o };
    }, {});
  }
  function stroke(it) { return safe(function () { var w = it.strokeWeight; if (!w) return null; var c = color(it.strokeColor, it.strokeTint); return c ? { w: r2(w), c: c } : null; }, null); }

  try {
    vp.horizontalMeasurementUnits = MeasurementUnits.POINTS; vp.verticalMeasurementUnits = MeasurementUnits.POINTS;
    vp.rulerOrigin = RulerOrigin.SPREAD_ORIGIN; doc.zeroPoint = [0, 0];
    var pageIdx = 0, step = 0;
    for (var si = 0; si < doc.spreads.length; si++) {
      var spread = doc.spreads[si], pages = spread.pages, pb = [];
      for (var q = 0; q < pages.length; q++) pb.push(pages[q].bounds);
      var recs = []; for (var q2 = 0; q2 < pages.length; q2++) recs.push([]);
      var items = spread.allPageItems, N = items.length;
      for (var ii = 0; ii < N; ii++) {
        var it = items[ii];
        var isTF = it instanceof TextFrame;
        if (!(isTF || it instanceof Rectangle || it instanceof Polygon || it instanceof Oval)) continue;
        if (safe(function () { return it.parent instanceof Character; }, false)) continue;            // anchored in a text
        if (safe(function () { return it.visible === false || it.itemLayer.visible === false; }, false)) continue;
        var kind = null, link = "";
        if (isTF) kind = isOnlyGraphic(it) ? "ph" : "tx";
        else {
          link = linkOf(it);
          if (link) kind = has(placeholders, link) ? "ph" : null;                                    // other images = decoration
          else if (safe(function () { return it.contentType == ContentType.GRAPHIC_TYPE; }, false)) kind = "ph";
        }
        if (!kind) continue;
        var gb = it.geometricBounds, pi_ = -1;
        for (var q3 = 0; q3 < pb.length; q3++) if (Math.min(gb[3], pb[q3][3]) - Math.max(gb[1], pb[q3][1]) > 0.5 && Math.min(gb[2], pb[q3][2]) - Math.max(gb[0], pb[q3][0]) > 0.5) { pi_ = q3; break; } // straddling: left page
        if (pi_ < 0) continue;
        var P = pb[pi_], W = P[3] - P[1], H = P[2] - P[0];
        var fr = { id: String(it.id), k: kind, x: r4((gb[1] - P[1]) / W), y: r4((gb[0] - P[0]) / H), w: r4((gb[3] - gb[1]) / W), h: r4((gb[2] - gb[0]) / H), z: N - ii };
        var rot = safe(function () { return it.rotationAngle; }, 0); if (rot) fr.r = r2(rot);
        var shp = shapeOf(it, gb); if (shp.sh) { fr.sh = shp.sh; if (shp.pts) fr.pts = shp.pts; }
        var fill = color(safe(function () { return it.fillColor; }, null), safe(function () { return it.fillTint; }, -1)); if (fill) fr.bg = fill;
        var sk = stroke(it); if (sk) fr.sk = sk;
        if (kind === "tx") {
          var story = it.parentStory, sid = String(story.id);
          if (!result.stories[sid]) result.stories[sid] = storyInfo(story);
          var tc = story.textContainers, ci = 0; for (var c = 0; c < tc.length; c++) if (tc[c].id === it.id) ci = c;
          var tp = it.textFramePreferences;
          fr.st = sid; fr.ci = ci; fr.cols = safe(function () { return tp.textColumnCount; }, 1);
          fr.gut = r2(safe(function () { return tp.textColumnGutter; }, 12));
          var ins = safe(function () { return tp.insetSpacing; }, 0); fr.ins = ins instanceof Array ? [r2(ins[0]), r2(ins[1]), r2(ins[2]), r2(ins[3])] : [r2(ins), r2(ins), r2(ins), r2(ins)];
          fr.vj = safe(function () { var v = tp.verticalJustification; return v == VerticalJustification.CENTER_ALIGN ? "c" : v == VerticalJustification.BOTTOM_ALIGN ? "b" : v == VerticalJustification.JUSTIFY_ALIGN ? "j" : "t"; }, "t");
          if (safe(function () { return it.overflows; }, false)) fr.ov = true;
          nTx++;
        } else { if (link) fr.ln = link; nPh++; }
        recs[pi_].push({ fr: fr, item: it });
      }
      for (var q4 = 0; q4 < pages.length; q4++) {
        var pg = pages[q4], B = pb[q4];
        var side = safe(function () { return pg.side == PageSideOptions.LEFT_HAND ? "l" : pg.side == PageSideOptions.RIGHT_HAND ? "r" : "s"; }, "s");
        var frs = []; for (var f = 0; f < recs[q4].length; f++) frs.push(recs[q4][f].fr);
        pageIdx++; pText.text = "Page " + pg.name + " (" + pageIdx + "/" + doc.pages.length + ")"; pBar.value = ++step;
        if (!frs.length) continue;
        var num = String(pg.documentOffset + 1); while (num.length < 3) num = "0" + num;
        result.pages.push({ pid: String(pg.id), name: String(pg.name), off: pg.documentOffset, side: side, w: r2(B[3] - B[1]), h: r2(B[2] - B[0]), img: "p" + num + ".jpg", bg: "p" + num + "-fond.jpg", frames: frs, _recs: recs[q4] });
      }
    }

    // ---------- low resolution previews: full page, then without the blocks ----------
    jp.exportingSpread = false; jp.jpegExportRange = ExportRangeOrAllPages.EXPORT_RANGE;
    safe(function () { jp.jpegQuality = JPEGOptionsQuality.MEDIUM; }); safe(function () { jp.exportResolution = 60; });
    safe(function () { jp.jpegColorSpace = JpegColorSpaceEnum.RGB; }); safe(function () { jp.antiAlias = true; }); safe(function () { jp.useDocumentBleeds = false; });
    app.scriptPreferences.enableRedraw = false;
    for (var e1 = 0; e1 < result.pages.length; e1++) {
      var rp = result.pages[e1];
      pText.text = "Aperçu de la page " + rp.name; pBar.value = ++step;
      jp.pageString = "+" + (rp.off + 1);
      doc.exportFile(ExportFormat.JPG, new File(out.fsName + "/" + rp.img), false);
      var rs = rp._recs;
      for (var h = 0; h < rs.length; h++) { var item = rs[h].item; if (safe(function () { return item.visible; }, false)) { item.visible = false; hidden.push(item); } }
      pText.text = "Fond de la page " + rp.name; pBar.value = ++step;
      doc.exportFile(ExportFormat.JPG, new File(out.fsName + "/" + rp.bg), false);
      while (hidden.length) { var hi = hidden.pop(); safe(function () { hi.visible = true; }); }
      delete rp._recs;
    }
  } catch (err) {
    progress.close();
    alert("L'export s'est arrêté : " + err.message + (err.line ? " (ligne " + err.line + ")" : ""));
    return;
  } finally {
    while (hidden.length) { var hx = hidden.pop(); safe(function () { hx.visible = true; }); }
    safe(function () { vp.horizontalMeasurementUnits = saved.h; vp.verticalMeasurementUnits = saved.v; vp.rulerOrigin = saved.ro; doc.zeroPoint = saved.zp; });
    for (var jk2 = 0; jk2 < JP_KEYS.length; jk2++) if (jSaved[JP_KEYS[jk2]] !== undefined) safe(function () { jp[JP_KEYS[jk2]] = jSaved[JP_KEYS[jk2]]; });
    app.scriptPreferences.enableRedraw = true;
  }
  progress.close();
  var jf = new File(out.fsName + "/mep.json"); jf.encoding = "UTF-8";
  if (!jf.open("w")) { alert("Impossible d'écrire " + jf.fsName); return; }
  jf.write(J(result)); jf.close();
  if (confirm("Export terminé : " + result.pages.length + " mises en page (" + nPh + " blocs photo, " + nTx + " blocs texte).\n\nDossier :\n" + out.fsName + "\n\nGlissez ce dossier sur le livre dans l'application (onglet Mises en page).\nOuvrir le dossier maintenant ?")) out.execute();
})();
