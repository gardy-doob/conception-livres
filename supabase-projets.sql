-- moodbook : un projet = un fichier de conception (« Mon projet - MEP ») + un fichier livre (« Mon projet »)
-- Les deux fichiers InDesign sont reliés au projet à la main, depuis le panneau moodbook.
-- À coller dans Supabase > SQL Editor > New query, puis « Run » (après supabase-creation.sql). Peut être relancé sans risque.

-- ---------- Fichiers InDesign d'un projet ----------
-- Un rôle par fichier : 'mep' (conception, mises en page) ou 'livre' (le document final, synchronisé en création).
-- Chaque fichier porte un identifiant unique écrit dedans par le panneau (doc_uid) : un fichier ne peut appartenir
-- qu'à un seul projet, et une copie du fichier (même identifiant, autre emplacement) est reconnue comme telle.
create table if not exists public.project_docs (
  owner      uuid not null references auth.users(id) on delete cascade,
  book_id    text not null,
  role       text not null check (role in ('mep', 'livre')),
  doc_uid    text not null,
  path       text,                       -- dernier emplacement du fichier (ordinateur qui l'a relié ou ouvert)
  paths      jsonb not null default '[]'::jsonb,  -- tous les emplacements reconnus (déplacement, autre ordinateur)
  name       text,                       -- nom du fichier, sans « .indd »
  linked_by  text,
  linked_at  timestamptz not null default now(),
  seen_at    timestamptz,                -- dernière ouverture dans InDesign avec le panneau
  seen_by    text,
  open_req   timestamptz,                -- demande d'ouverture envoyée depuis le site
  open_mode  text,                       -- 'open' ou 'fix' (ouvrir puis resynchroniser)
  open_for   text,                       -- e-mail du compte dont le panneau doit ouvrir le fichier
  open_err   text,                       -- réponse du panneau si l'ouverture a échoué
  fixed_at   timestamptz,                -- dernière synchronisation corrective
  primary key (owner, book_id, role)
);
alter table public.project_docs add column if not exists paths jsonb not null default '[]'::jsonb;
create unique index if not exists project_docs_uid on public.project_docs (doc_uid);
alter table public.project_docs enable row level security;
drop policy if exists "Fichiers du projet" on public.project_docs;
create policy "Fichiers du projet" on public.project_docs
  for all to authenticated using (public.mb_can(owner, book_id)) with check (public.mb_can(owner, book_id));

-- Relier un fichier à un projet (dans une seule opération).
-- Refuse, sauf p_force, si ce fichier est déjà relié à un autre projet ou à l'autre rôle (reason 'other'),
-- ou si le projet a déjà un autre fichier pour ce rôle (reason 'taken').
create or replace function public.doc_link(p_owner uuid, p_book text, p_role text, p_uid text, p_path text, p_name text,
  p_by text, p_force boolean default false)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare o public.project_docs; c public.project_docs;
begin
  if not public.mb_can(p_owner, p_book) then raise exception 'Accès refusé à ce projet'; end if;
  select * into o from public.project_docs where doc_uid = p_uid and not (owner = p_owner and book_id = p_book and role = p_role);
  if found and not p_force then
    return jsonb_build_object('ok', false, 'reason', 'other', 'book', o.book_id, 'owner', o.owner, 'role', o.role);
  end if;
  select * into c from public.project_docs where owner = p_owner and book_id = p_book and role = p_role;
  if found and c.doc_uid <> p_uid and not p_force then
    return jsonb_build_object('ok', false, 'reason', 'taken', 'name', c.name, 'path', c.path);
  end if;
  delete from public.project_docs where doc_uid = p_uid and not (owner = p_owner and book_id = p_book and role = p_role);
  insert into public.project_docs (owner, book_id, role, doc_uid, path, paths, name, linked_by, linked_at, seen_at, seen_by)
  values (p_owner, p_book, p_role, p_uid, p_path, jsonb_build_array(p_path), p_name, p_by, now(), now(), p_by)
  on conflict (owner, book_id, role) do update set doc_uid = excluded.doc_uid, path = excluded.path, name = excluded.name,
    paths = case when project_docs.doc_uid = excluded.doc_uid
      then (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements_text(project_docs.paths || excluded.paths) x)
      else excluded.paths end,
    linked_by = excluded.linked_by, linked_at = now(), seen_at = now(), seen_by = excluded.seen_by,
    open_req = null, open_mode = null, open_for = null, open_err = null;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Notes / à faire d'un projet ----------
create table if not exists public.project_todos (
  owner      uuid not null references auth.users(id) on delete cascade,
  book_id    text not null,
  id         text not null,
  text       text not null default '',
  target     text not null default 'site' check (target in ('site', 'indesign')),
  page       integer,
  done       boolean not null default false,
  by_name    text,
  done_by    text,
  done_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner, book_id, id)
);
alter table public.project_todos enable row level security;
drop policy if exists "Notes du projet" on public.project_todos;
create policy "Notes du projet" on public.project_todos
  for all to authenticated using (public.mb_can(owner, book_id)) with check (public.mb_can(owner, book_id));

-- Mise à jour instantanée
alter table public.project_docs  replica identity full;
alter table public.project_todos replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.project_docs;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.project_todos; exception when duplicate_object then null; end;
end $$;
