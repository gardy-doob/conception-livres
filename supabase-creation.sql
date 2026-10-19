-- moodbook : partage des livres et phase Création synchronisée avec InDesign
-- À coller dans Supabase > SQL Editor > New query, puis « Run » (après supabase-setup.sql). Peut être relancé sans risque.

-- ---------- Partage d'un livre avec un autre compte (par e-mail) ----------
create table if not exists public.book_shares (
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book_id    text not null,
  email      text not null,
  created_at timestamptz not null default now(),
  primary key (owner, book_id, email)
);
alter table public.book_shares enable row level security;
drop policy if exists "Partages : propriétaire" on public.book_shares;
drop policy if exists "Partages : invité" on public.book_shares;
create policy "Partages : propriétaire" on public.book_shares
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "Partages : invité" on public.book_shares
  for select to authenticated using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Accès à un livre : son propriétaire, ou une personne avec qui il est partagé
create or replace function public.mb_can(o uuid, b text) returns boolean
language sql stable security definer set search_path = public as $$
  select o = auth.uid() or exists (
    select 1 from public.book_shares s
    where s.owner = o and s.book_id = b and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

drop policy if exists "Livres partagés" on public.books;
drop policy if exists "Livres partagés : modifier" on public.books;
create policy "Livres partagés" on public.books
  for select to authenticated using (public.mb_can(user_id, id));
create policy "Livres partagés : modifier" on public.books
  for update to authenticated using (public.mb_can(user_id, id)) with check (public.mb_can(user_id, id));

-- ---------- Phase Création : le document InDesign réel ----------
-- Structure du document (pages, blocs, styles), écrite par le panneau InDesign
create table if not exists public.creations (
  owner      uuid not null references auth.users(id) on delete cascade,
  book_id    text not null,
  data       jsonb not null,
  rev        integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (owner, book_id)
);
-- Aperçus des pages exportés par InDesign
create table if not exists public.creation_images (
  owner   uuid not null references auth.users(id) on delete cascade,
  book_id text not null,
  key     text not null,
  data    text not null,
  primary key (owner, book_id, key)
);
-- Un enregistrement par bloc photo et par texte (histoire chaînée), avec version et verrou
create table if not exists public.blocks (
  owner       uuid not null references auth.users(id) on delete cascade,
  book_id     text not null,
  bid         text not null,             -- « f<id> » bloc photo, « s<id> » texte (histoire)
  kind        text not null,             -- 'ph' ou 'tx'
  page        integer,
  data        jsonb,                     -- contenu actuel
  cdata       jsonb,                     -- dernier contenu « sûr » (enregistré dans InDesign ou écrit sur le site)
  rev         integer not null default 1,
  src         text not null default 'site',   -- 'site' ou 'id' (InDesign)
  committed   boolean not null default true,  -- false : modifié dans InDesign mais pas encore enregistré
  by_name     text,
  updated_at  timestamptz not null default now(),
  lock_sid    text,                      -- session qui tient le verrou (onglet du site ou panneau InDesign)
  lock_name   text,
  lock_client text,                      -- 'site' ou 'indesign'
  lock_until  timestamptz,
  deleted     boolean not null default false,
  primary key (owner, book_id, bid)
);

alter table public.creations       enable row level security;
alter table public.creation_images enable row level security;
alter table public.blocks          enable row level security;
drop policy if exists "Création" on public.creations;
drop policy if exists "Création : aperçus" on public.creation_images;
drop policy if exists "Création : blocs" on public.blocks;
create policy "Création" on public.creations
  for all to authenticated using (public.mb_can(owner, book_id)) with check (public.mb_can(owner, book_id));
create policy "Création : aperçus" on public.creation_images
  for all to authenticated using (public.mb_can(owner, book_id)) with check (public.mb_can(owner, book_id));
create policy "Création : blocs" on public.blocks
  for all to authenticated using (public.mb_can(owner, book_id)) with check (public.mb_can(owner, book_id));

-- Présence : qui est sur le livre (onglet du site ou panneau InDesign), signal toutes les 20 s
create table if not exists public.book_presence (
  owner   uuid not null references auth.users(id) on delete cascade,
  book_id text not null,
  sid     text not null,
  client  text not null,                 -- 'site' ou 'indesign'
  name    text,
  doc     text,
  page    text,
  bid     text,
  active  boolean not null default true,
  seen_at timestamptz not null default now(),
  primary key (owner, book_id, sid)
);
alter table public.book_presence enable row level security;
drop policy if exists "Présence" on public.book_presence;
create policy "Présence" on public.book_presence
  for all to authenticated using (public.mb_can(owner, book_id)) with check (public.mb_can(owner, book_id));

-- ---------- Écritures sûres (vérifient la version et le verrou dans la même opération) ----------
-- p_rev : version attendue (0 = création du bloc, -1 = forcer)
create or replace function public.block_save(p_owner uuid, p_book text, p_bid text, p_kind text, p_page integer,
  p_data jsonb, p_rev integer, p_src text, p_committed boolean, p_sid text, p_name text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare r public.blocks;
begin
  if not public.mb_can(p_owner, p_book) then raise exception 'Accès refusé'; end if;
  select * into r from public.blocks where owner = p_owner and book_id = p_book and bid = p_bid for update;
  if not found then
    if p_rev > 0 then return jsonb_build_object('ok', false, 'reason', 'missing'); end if;
    insert into public.blocks (owner, book_id, bid, kind, page, data, cdata, rev, src, committed, by_name)
    values (p_owner, p_book, p_bid, p_kind, p_page, p_data, case when p_committed then p_data end, 1, p_src, p_committed, p_name)
    returning * into r;
    return jsonb_build_object('ok', true, 'row', to_jsonb(r));
  end if;
  if r.lock_until > now() and r.lock_sid is distinct from p_sid then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'row', to_jsonb(r));
  end if;
  if p_rev >= 0 and r.rev <> p_rev and not r.deleted then
    return jsonb_build_object('ok', false, 'reason', 'rev', 'row', to_jsonb(r));
  end if;
  update public.blocks set data = p_data, kind = coalesce(p_kind, kind), page = coalesce(p_page, page), rev = r.rev + 1,
    src = p_src, committed = p_committed, cdata = case when p_committed then p_data else cdata end,
    by_name = p_name, updated_at = now(), deleted = false
  where owner = p_owner and book_id = p_book and bid = p_bid returning * into r;
  return jsonb_build_object('ok', true, 'row', to_jsonb(r));
end $$;

-- Prend (ou prolonge) le verrou d'un bloc pour p_ttl secondes
create or replace function public.block_lock(p_owner uuid, p_book text, p_bid text, p_sid text, p_name text, p_client text, p_ttl integer)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare r public.blocks;
begin
  update public.blocks set lock_sid = p_sid, lock_name = p_name, lock_client = p_client,
    lock_until = now() + make_interval(secs => greatest(5, least(p_ttl, 600))),
    updated_at = case when lock_sid is distinct from p_sid then now() else updated_at end
  where owner = p_owner and book_id = p_book and bid = p_bid
    and (lock_until is null or lock_until < now() or lock_sid = p_sid)
  returning * into r;
  if found then return jsonb_build_object('ok', true, 'row', to_jsonb(r)); end if;
  select * into r from public.blocks where owner = p_owner and book_id = p_book and bid = p_bid;
  return jsonb_build_object('ok', false, 'row', to_jsonb(r));
end $$;

-- Rend les verrous d'une session (un bloc précis, ou tous)
create or replace function public.block_unlock(p_owner uuid, p_book text, p_sid text, p_bid text default null)
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  update public.blocks set lock_sid = null, lock_name = null, lock_client = null, lock_until = null, updated_at = now()
  where owner = p_owner and book_id = p_book and lock_sid = p_sid and (p_bid is null or bid = p_bid);
  get diagnostics n = row_count; return n;
end $$;

-- Le document InDesign vient d'être enregistré : ses modifications envoyées deviennent « sûres »
create or replace function public.blocks_commit(p_owner uuid, p_book text)
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  update public.blocks set committed = true, cdata = data
  where owner = p_owner and book_id = p_book and src = 'id' and not committed;
  get diagnostics n = row_count; return n;
end $$;

-- InDesign fermé sans enregistrer (ou planté) : on revient au dernier contenu sûr
create or replace function public.blocks_revert(p_owner uuid, p_book text)
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  update public.blocks set data = cdata, rev = rev + 1, committed = true, updated_at = now(),
    deleted = (cdata is null)
  where owner = p_owner and book_id = p_book and src = 'id' and not committed;
  get diagnostics n = row_count; return n;
end $$;

-- Mise à jour instantanée
alter table public.creations       replica identity full;
alter table public.creation_images replica identity full;
alter table public.blocks          replica identity full;
alter table public.book_shares     replica identity full;
alter table public.book_presence   replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.creations;       exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.creation_images; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.blocks;          exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.book_shares;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.book_presence;   exception when duplicate_object then null; end;
end $$;
