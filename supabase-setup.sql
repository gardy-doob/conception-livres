-- Chemin de fer - conception livre : tables et règles d'accès
-- À coller dans Supabase > SQL Editor > New query, puis « Run ».
-- Chaque ligne appartient à un utilisateur connecté ; personne d'autre ne peut la lire ni la modifier.

create table if not exists public.books (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.book_versions (
  user_id uuid    not null default auth.uid() references auth.users(id) on delete cascade,
  key     text    not null,
  book_id text    not null,
  t       bigint  not null,
  label   text,
  auto    boolean not null default false,
  data    jsonb   not null,
  primary key (user_id, key)
);

create table if not exists public.layout_images (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key     text not null,
  data    text not null,
  primary key (user_id, key)
);

alter table public.books         enable row level security;
alter table public.book_versions enable row level security;
alter table public.layout_images enable row level security;

drop policy if exists "Mes livres"            on public.books;
drop policy if exists "Mes versions"          on public.book_versions;
drop policy if exists "Mes images de mise en page" on public.layout_images;

create policy "Mes livres" on public.books
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Mes versions" on public.book_versions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Mes images de mise en page" on public.layout_images
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Mise à jour instantanée entre onglets et ordinateurs
alter table public.books         replica identity full;
alter table public.book_versions replica identity full;
alter table public.layout_images replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.books;         exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.book_versions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.layout_images; exception when duplicate_object then null; end;
end $$;
