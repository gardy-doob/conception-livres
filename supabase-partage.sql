-- moodbook : partage simplifié (à coller dans Supabase > SQL Editor, après supabase-creation.sql ; relançable)
-- 1. Le nom du propriétaire est gardé avec le partage, pour que l'invité voie « partagé par … »
alter table public.book_shares add column if not exists owner_email text;
-- Rempli automatiquement quand le propriétaire partage depuis le site sans la fonction « partage »
alter table public.book_shares alter column owner_email set default (auth.jwt() ->> 'email');
-- 2. Le propriétaire peut aussi mettre à jour une invitation (renvoi) : déjà couvert par la politique « Partages : propriétaire » (for all).
-- 3. À faire une fois dans l'interface Supabase, sinon les liens reçus par e-mail (invitation, mot de passe oublié,
--    lien de connexion) ne ramènent pas sur le site :
--    Authentication > URL Configuration > Site URL : https://gardy-doob.github.io/conception-livres/
--    Authentication > URL Configuration > Redirect URLs : https://gardy-doob.github.io/conception-livres/**
-- 4. Déployer la fonction « partage » :  supabase functions deploy partage
--    (secret facultatif MOODBOOK_SITE_URL si le site change d'adresse)
