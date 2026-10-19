// Chemin de fer - conception livre : relecture des textes par Claude Haiku
// Fonction Supabase « relecture ». La clé Anthropic reste ici, dans les secrets de Supabase (ANTHROPIC_API_KEY).
// Seul un utilisateur connecté à l'application peut l'appeler.
// Réponse : { corrections: [{p, avant, apres, type, raison}], questions: [{p, avant, apres, question}] }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SYSTEM = `Tu es correcteur professionnel pour des livres photo en français. On te donne les paragraphes d'un bloc de texte, numérotés à partir de 0.
Ton seul rôle : l'orthographe, la conjugaison et les accords, la ponctuation.
Règles :
- Ne réécris jamais le texte. Ne change ni le style, ni le ton, ni le vocabulaire, ni l'ordre des mots, ni les noms propres, ni les majuscules voulues, ni les abréviations, ni les émojis.
- Ne signale que ce qui est faux. Si tout est correct, renvoie deux listes vides.
- "corrections" : les fautes certaines (orthographe, conjugaison, accord, ponctuation) et les fautes de formulation évidentes (mot répété par erreur, mot manquant flagrant). Elles sont appliquées automatiquement, sans demander.
- "questions" : tout ce qui dépend de l'intention de l'auteur ou dont tu n'es pas sûr (formulation maladroite, sens ambigu, nom propre ou lieu inconnu, choix de style, faute possible). Propose ta correction dans "apres" et pose une question courte et claire.
- Ponctuation française : espace avant ; : ! ? et à l'intérieur des guillemets « », avec une espace simple.
- "avant" est un extrait EXACT et contigu du paragraphe "p", copié caractère pour caractère, le plus court possible tout en étant unique dans ce paragraphe. "apres" est son remplacement.
- Une entrée par faute. "raison" : quelques mots (ex. « accord du participe », « conjugaison », « virgule manquante »).`;

const TOOL = {
  name: "relecture",
  description: "Renvoie les corrections certaines et les questions de la relecture.",
  input_schema: {
    type: "object",
    properties: {
      corrections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            p: { type: "integer", description: "numéro du paragraphe" },
            avant: { type: "string" },
            apres: { type: "string" },
            type: { type: "string", enum: ["orthographe", "conjugaison", "accord", "ponctuation", "formulation"] },
            raison: { type: "string" },
          },
          required: ["p", "avant", "apres", "type"],
        },
      },
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            p: { type: "integer" },
            avant: { type: "string" },
            apres: { type: "string" },
            question: { type: "string" },
          },
          required: ["p", "avant", "apres", "question"],
        },
      },
    },
    required: ["corrections", "questions"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405);

  // Only a user logged in to the application (the public anon key alone is refused)
  const auth = req.headers.get("Authorization") || "";
  const who = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
  });
  if (!who.ok) return json({ error: "Connectez-vous à l'application." }, 401);
  const user = await who.json();
  const allowed = (Deno.env.get("RELECTURE_EMAILS") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(String(user.email || "").toLowerCase())) return json({ error: "Compte non autorisé." }, 403);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "Clé ANTHROPIC_API_KEY absente des secrets Supabase." }, 500);

  let paras: string[] = [];
  try { paras = (await req.json()).paras; } catch { return json({ error: "Requête illisible" }, 400); }
  if (!Array.isArray(paras) || !paras.length) return json({ error: "Aucun texte" }, 400);
  paras = paras.map((p) => String(p ?? "")).slice(0, 80);
  if (paras.join("").length > 20000) return json({ error: "Texte trop long pour une relecture (20 000 caractères max)." }, 413);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("RELECTURE_MODEL") || "claude-haiku-5-5",
      max_tokens: 4096,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "relecture" },
      messages: [{ role: "user", content: "Paragraphes à relire :\n" + JSON.stringify(paras.map((t, p) => ({ p, texte: t })), null, 1) }],
    }),
  });
  if (!r.ok) return json({ error: `Claude a répondu ${r.status} : ${(await r.text()).slice(0, 300)}` }, 502);
  const out = await r.json();
  const use = (out.content || []).find((c: { type: string }) => c.type === "tool_use");
  const res = use?.input || { corrections: [], questions: [] };
  // Keep only well-formed entries whose excerpt really exists in its paragraph
  const ok = (x: { p: number; avant: string }) => Number.isInteger(x?.p) && typeof x.avant === "string" && x.avant && (paras[x.p] ?? "").includes(x.avant);
  return json({
    corrections: (res.corrections || []).filter(ok).filter((x: { avant: string; apres: string }) => x.avant !== x.apres),
    questions: (res.questions || []).filter(ok),
  });
});
