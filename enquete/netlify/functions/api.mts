// API de l'enquête : sauvegarde des sessions (Netlify Blobs), reprise par e-mail, interprétation d'une réponse libre (Claude), export admin.
import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const store = () => getStore({ name: "enquete", consistency: "strong" });
const json = (b: unknown, status = 200) => Response.json(b, { status });
const hash = async (s: string) => {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s.trim().toLowerCase()));
  return Array.from(new Uint8Array(d)).map(x => x.toString(16).padStart(2, "0")).join("").slice(0, 32);
};
const okSid = (s: unknown) => typeof s === "string" && /^[\w-]{8,64}$/.test(s);

export default async (req: Request, context: Context) => {
  const action = context.params.action;
  const url = new URL(req.url);

  // Export admin : /api/export?k=<ENQUETE_ADMIN_KEY>[&format=csv]
  if (action === "export") {
    const key = Netlify.env.get("ENQUETE_ADMIN_KEY");
    if (!key || url.searchParams.get("k") !== key) return json({ error: "Accès refusé." }, 403);
    const st = store();
    const { blobs } = await st.list({ prefix: "sessions/" });
    const sessions: any[] = [];
    for (const b of blobs) { const s = await st.get(b.key, { type: "json" }); if (s) sessions.push(s); }
    sessions.sort((a, b) => String(b.updated || "").localeCompare(String(a.updated || "")));
    if (url.searchParams.get("format") === "csv") {
      const qs = Array.from({ length: 30 }, (_, i) => "Q" + String(i + 1).padStart(2, "0"));
      const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const head = ["sid", "prenom", "email", "started", "updated", "done", "step", ...qs, ...qs.map(q => q + "_txt"), "Q03b", "Q12b", "Q18b", "Q21b", "dernier"];
      const rows = sessions.map(s => [s.sid, s.prenom, s.email, s.started, s.updated, s.done, s.step, ...qs.map(q => s.answers?.[q]), ...qs.map(q => s.other?.[q]), s.other?.Q03b, s.other?.Q12b, s.other?.Q18b, s.other?.Q21b, s.other?.dernier].map(cell).join(";"));
      return new Response("﻿" + [head.join(";"), ...rows].join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=enquete.csv" } });
    }
    return json({ count: sessions.length, sessions });
  }

  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "JSON attendu." }, 400); }

  // Sauvegarde d'une session (la dernière écriture gagne : une seule personne par session)
  if (action === "session") {
    if (!okSid(body.sid)) return json({ error: "sid invalide." }, 400);
    const s = {
      sid: body.sid, prenom: String(body.prenom || "").slice(0, 60), email: String(body.email || "").slice(0, 120).toLowerCase(),
      answers: body.answers || {}, other: body.other || {}, log: Array.isArray(body.log) ? body.log.slice(-400) : [],
      step: String(body.step || ""), done: body.done || false, started: body.started, updated: new Date().toISOString(), ua: String(body.ua || "").slice(0, 120),
      ip: context.ip, country: context.geo?.country?.code,
    };
    const st = store();
    await st.setJSON(`sessions/${s.sid}`, s);
    if (s.email) await st.set(`emails/${await hash(s.email)}`, s.sid);
    return json({ ok: true });
  }

  // Reprise : retrouve la session la plus avancée pour cet e-mail (autre que celle en cours)
  if (action === "find") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ session: null });
    const st = store();
    const sid = await st.get(`emails/${await hash(email)}`);
    if (!sid || sid === body.sid) return json({ session: null });
    const s = await st.get(`sessions/${sid}`, { type: "json" });
    return json({ session: s || null });
  }

  // Réponse libre sur un QCM : Claude la rattache à un choix, ou dit qu'elle n'en est pas un
  if (action === "interpret") {
    const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
    const text = String(body.text || "").slice(0, 600);
    const choices = Array.isArray(body.choices) ? body.choices : [];
    if (!apiKey || !text || !choices.length) return json({ choice: null, ack: null });
    const prompt = `Tu aides un chatbot d'enquête en français (tutoiement, ton simple et sobre). La personne a répondu avec ses mots à une question à choix.
Question : ${body.question}
Choix :
${choices.map((c: any) => `${c.k}. ${c.t}`).join("\n")}
Réponse de la personne : « ${text} »
${body.multi ? `Plusieurs choix possibles (au plus ${body.multi}), lettres séparées par des virgules.` : "Un seul choix."}
Réponds en JSON strict : {"choice": "<lettre(s) ou null si la réponse ne correspond clairement à aucun choix ou est un refus>", "ack": "<une phrase courte (max 15 mots) qui accuse réception sans complimenter ; si choice est null, accueille brièvement sans insister>"}`;
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: Netlify.env.get("ENQUETE_MODEL") || "claude-haiku-5-5", max_tokens: 150, messages: [{ role: "user", content: prompt }] }),
      });
      const j: any = await r.json();
      const out = String(j.content?.[0]?.text || "");
      const m = out.match(/\{[\s\S]*\}/);
      const parsed = m ? JSON.parse(m[0]) : {};
      const letters = String(parsed.choice || "").toUpperCase().split(/[\s,]+/).filter(l => choices.some((c: any) => c.k === l));
      const choice = letters.length ? letters.slice(0, body.multi || 1).join(",") : null;
      return json({ choice, ack: typeof parsed.ack === "string" ? parsed.ack.slice(0, 200) : null });
    } catch (e) {
      return json({ choice: null, ack: null });
    }
  }

  return json({ error: "Action inconnue." }, 404);
};

export const config: Config = { path: "/api/:action" };
