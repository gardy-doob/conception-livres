-- moodbook : polices ajoutées par les utilisateurs (fichiers OTF / TTF)
-- Le site dessine les textes avec les polices du navigateur ; une police absente est remplacée et les lignes ne tombent
-- plus comme dans InDesign. Chaque compte peut donc ajouter ses fichiers de police : ils restent dans son compte et ne sont
-- lisibles que par lui et par les personnes avec qui il partage au moins un livre.
-- À coller dans Supabase > SQL Editor > New query, puis « Run » (après supabase-creation.sql). Peut être relancé sans risque.

create table if not exists public.user_fonts (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  family     text not null,                 -- famille, comme dans InDesign (ex. « Minion Pro »)
  style      text not null default 'Regular',
  ps         text,                          -- nom PostScript
  weight     integer,
  italic     boolean not null default false,
  size       integer,
  file       text,                          -- nom du fichier envoyé
  data       text not null,                 -- le fichier, en base64
  created_at timestamptz not null default now()
);
create unique index if not exists user_fonts_face on public.user_fonts (owner, family, style);
alter table public.user_fonts enable row level security;

drop policy if exists "Polices : propriétaire" on public.user_fonts;
drop policy if exists "Polices : livres partagés" on public.user_fonts;
create policy "Polices : propriétaire" on public.user_fonts
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "Polices : livres partagés" on public.user_fonts
  for select to authenticated using (exists (
    select 1 from public.book_shares s
    where s.owner = user_fonts.owner and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));
