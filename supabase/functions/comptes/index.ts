// moodbook : gestion des comptes par l'administrateur (fonction Supabase « comptes »)
// Les inscriptions libres sont fermées dans Supabase : seuls les administrateurs créent les comptes, depuis le site.
// La clé de service de Supabase (SUPABASE_SERVICE_ROLE_KEY) est fournie automatiquement à la fonction par Supabase :
// elle reste sur le serveur et n'est jamais envoyée au site.
// Administrateurs : gardy.eugene@gmail.com, plus ceux du secret facultatif MOODBOOK_ADMINS (e-mails séparés par des virgules).
// Actions (POST, JSON) : list · create {email, password} · password {id, password} · disable {id} · enable {id} · delete {id}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMINS = ["gardy.eugene@gmail.com", ...(Deno.env.get("MOODBOOK_ADMINS") || "").split(",")]
  .map((s) => s.trim().toLowerCase()).filter(Boolean);

async function admin(path: string, method = "GET", body?: unknown) {
  const r = await fetch(`${URL_}/auth/v1/admin/${path}`, {
    method,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text(); let j: any = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  if (!r.ok) throw new Error((j && (j.msg || j.message || j.error_description || j.error)) || `erreur ${r.status}`);
  return j;
}
const view = (u: any) => ({
  id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at || null,
  disabled: !!(u.banned_until && new Date(u.banned_until).getTime() > Date.now()),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  if (!SERVICE) return json({ error: "Clé de service indisponible dans la fonction." }, 500);

  // Who is calling: only a connected administrator
  const who = await fetch(`${URL_}/auth/v1/user`, { headers: { Authorization: req.headers.get("Authorization") || "", apikey: ANON } });
  if (!who.ok) return json({ error: "Connectez-vous." }, 401);
  const me = await who.json();
  if (!ADMINS.includes(String(me.email || "").toLowerCase())) return json({ error: "Réservé à l'administrateur." }, 403);

  let a: any = {}; try { a = await req.json(); } catch { /* empty */ }
  const email = String(a.email || "").trim().toLowerCase();
  const password = String(a.password || "");
  const id = String(a.id || "");
  try {
    switch (a.action) {
      case "list": {
        const r = await admin("users?per_page=1000");
        const users = (r.users || r || []).map(view).sort((x: any, y: any) => String(x.email).localeCompare(String(y.email)));
        return json({ users });
      }
      case "create": {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Adresse e-mail invalide." }, 400);
        if (password.length < 8) return json({ error: "Mot de passe de 8 caractères minimum." }, 400);
        const u = await admin("users", "POST", { email, password, email_confirm: true });
        return json({ user: view(u.user || u) });
      }
      case "password": {
        if (!id || password.length < 8) return json({ error: "Mot de passe de 8 caractères minimum." }, 400);
        const u = await admin(`users/${id}`, "PUT", { password });
        return json({ user: view(u.user || u) });
      }
      case "disable": case "enable": {
        if (!id) return json({ error: "Compte manquant." }, 400);
        if (id === me.id) return json({ error: "Vous ne pouvez pas désactiver votre propre compte." }, 400);
        const u = await admin(`users/${id}`, "PUT", { ban_duration: a.action === "disable" ? "876000h" : "none" });
        return json({ user: view(u.user || u) });
      }
      case "delete": {
        if (!id) return json({ error: "Compte manquant." }, 400);
        if (id === me.id) return json({ error: "Vous ne pouvez pas supprimer votre propre compte." }, 400);
        await admin(`users/${id}`, "DELETE");
        return json({ ok: true });
      }
      default: return json({ error: "Action inconnue." }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
