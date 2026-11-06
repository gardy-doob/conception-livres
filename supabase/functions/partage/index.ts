// moodbook : partage d'un livre avec une autre personne (fonction Supabase « partage »)
// Le propriétaire d'un livre tape une adresse e-mail ; si cette adresse n'a pas encore de compte,
// Supabase lui envoie un e-mail d'invitation (lien de connexion). En cliquant, la personne choisit
// un mot de passe sur le site et voit le livre dans sa liste. Plus besoin que l'administrateur crée le compte.
// La clé de service reste sur le serveur. Actions (POST, JSON) : list {book_id} · add {book_id, email} · remove {book_id, email}
// Pré-requis : dans Supabase > Authentication > URL Configuration, ajouter l'URL du site aux « Redirect URLs ».

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
const SITE = (Deno.env.get("MOODBOOK_SITE_URL") || "https://gardy-doob.github.io/conception-livres/").replace(/\/?$/, "/");

const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
async function call(path: string, method = "GET", body?: unknown, extra: Record<string, string> = {}) {
  const r = await fetch(`${URL_}${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j: any = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  if (!r.ok) throw new Error((j && (j.msg || j.message || j.error_description || j.error)) || `erreur ${r.status}`);
  return j;
}
// All accounts, by e-mail (a few dozen at most for this project)
async function usersByEmail(): Promise<Map<string, any>> {
  const r = await call(`/auth/v1/admin/users?per_page=1000`);
  const m = new Map<string, any>();
  for (const u of (r.users || r || [])) if (u.email) m.set(String(u.email).toLowerCase(), u);
  return m;
}
const status = (u: any) => !u ? "none" : u.last_sign_in_at ? "active" : "invited";
const shareView = (s: any, users: Map<string, any>) => {
  const u = users.get(String(s.email).toLowerCase());
  return { email: s.email, created_at: s.created_at, status: status(u), last_sign_in_at: u?.last_sign_in_at || null };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  if (!SERVICE) return json({ error: "Clé de service indisponible dans la fonction." }, 500);

  const who = await fetch(`${URL_}/auth/v1/user`, { headers: { Authorization: req.headers.get("Authorization") || "", apikey: ANON } });
  if (!who.ok) return json({ error: "Connectez-vous." }, 401);
  const me = await who.json();

  let a: any = {}; try { a = await req.json(); } catch { /* empty */ }
  const bookId = String(a.book_id || "");
  const email = String(a.email || "").trim().toLowerCase();
  if (!bookId) return json({ error: "Livre manquant." }, 400);
  try {
    // Only the owner of the book can see or change its shares
    const books = await call(`/rest/v1/books?select=id,data&id=eq.${encodeURIComponent(bookId)}&user_id=eq.${me.id}`);
    if (!Array.isArray(books) || !books.length) return json({ error: "Seul le propriétaire du livre peut le partager." }, 403);
    const title = String(books[0].data?.title || "ce livre");

    switch (a.action) {
      case "list": {
        const [shares, users] = await Promise.all([
          call(`/rest/v1/book_shares?select=email,created_at&owner=eq.${me.id}&book_id=eq.${encodeURIComponent(bookId)}&order=created_at.asc`),
          usersByEmail(),
        ]);
        return json({ shares: shares.map((s: any) => shareView(s, users)) });
      }
      case "add": {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Adresse e-mail invalide." }, 400);
        if (email === String(me.email || "").toLowerCase()) return json({ error: "C'est votre propre adresse." }, 400);
        const users = await usersByEmail();
        let u = users.get(email);
        let invited = false;
        if (!u) {
          // No account yet: Supabase sends the invitation e-mail; the link opens the site, where the person picks a password
          const r = await call(`/auth/v1/invite`, "POST", { email, data: { invited_by: me.email, book_title: title } }, {});
          u = r.user || r; invited = true;
        }
        await call(`/rest/v1/book_shares`, "POST",
          { owner: me.id, book_id: bookId, email, owner_email: me.email },
          { Prefer: "resolution=merge-duplicates,return=minimal" });
        return json({ share: { email, created_at: new Date().toISOString(), status: status(u), last_sign_in_at: u?.last_sign_in_at || null }, invited });
      }
      case "remove": {
        if (!email) return json({ error: "Adresse manquante." }, 400);
        await call(`/rest/v1/book_shares?owner=eq.${me.id}&book_id=eq.${encodeURIComponent(bookId)}&email=eq.${encodeURIComponent(email)}`, "DELETE", undefined, { Prefer: "return=minimal" });
        return json({ ok: true });
      }
      default: return json({ error: "Action inconnue." }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
