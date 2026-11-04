-- =====================================================================
-- Planner Escolar Familiar v2.0.0 — Usuários, planners e permissões
-- Rodar UMA vez no SQL Editor do Supabase (projeto "Nutri e concursos").
--
-- ANTES DE RODAR:
--   1) Troque 'SEU_EMAIL_AQUI' (bloco 3) pelo e-mail da sua conta de administrador.
--   2) Rode este SQL e publique o app v2.0.0 em seguida (o app v1.x deixa de
--      gravar depois deste SQL, porque as provas passam a exigir um planner).
--
-- Tudo roda numa transação: se algo falhar (ex.: e-mail não encontrado),
-- nada é alterado.
-- Prefixo school_ / sp_ evita conflito com tabelas dos outros apps do projeto.
-- =====================================================================
begin;

-- 1) Tabelas ----------------------------------------------------------
create table if not exists public.school_planners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  kind text not null default 'generico' check (kind in ('marista','generico')),
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists school_planners_um_marista
  on public.school_planners(kind) where kind = 'marista';

create table if not exists public.school_planner_members (
  planner_id uuid not null references public.school_planners(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('leitor','editor','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (planner_id, user_id)
);
create index if not exists school_planner_members_user_idx
  on public.school_planner_members(user_id);

create table if not exists public.school_planner_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists school_planner_profiles_email_idx
  on public.school_planner_profiles(lower(email));

create table if not exists public.school_planner_invites (
  id uuid primary key default gen_random_uuid(),
  planner_id uuid not null references public.school_planners(id) on delete cascade,
  email text not null,
  role text not null check (role in ('leitor','editor','admin')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (planner_id, email)
);

create table if not exists public.school_app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.school_planner_items add column if not exists planner_id uuid;

-- 2) Funções de permissão ----------------------------------------------
create or replace function public.sp_is_app_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.school_app_admins a where a.user_id = auth.uid());
$$;

-- papel efetivo do usuário logado no planner: 'admin' | 'editor' | 'leitor' | null
create or replace function public.sp_role(p_planner uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when public.sp_is_app_admin() then 'admin'
    else (select m.role from public.school_planner_members m
          where m.planner_id = p_planner and m.user_id = auth.uid() and m.active)
  end;
$$;

-- quem gerencia membros: administrador geral (qualquer planner) ou admin de planner genérico
create or replace function public.sp_can_manage(p_planner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.sp_is_app_admin()
      or exists (select 1
                 from public.school_planners pl
                 join public.school_planner_members m on m.planner_id = pl.id
                 where pl.id = p_planner and pl.kind = 'generico'
                   and m.user_id = auth.uid() and m.active and m.role = 'admin');
$$;

-- 3) Migração dos dados atuais para o planner Marista -------------------
do $$
declare
  v_admin_email text := 'SEU_EMAIL_AQUI';   -- <<< TROQUE AQUI
  v_admin uuid;
  v_pl uuid;
begin
  select u.id into v_admin from auth.users u where lower(u.email) = lower(v_admin_email);
  if v_admin is null then
    raise exception 'E-mail do administrador (%) não encontrado em auth.users. Edite o bloco 3 do SQL.', v_admin_email;
  end if;

  insert into public.school_planner_profiles(user_id, email)
    select u.id, lower(u.email) from auth.users u where u.email is not null
    on conflict (user_id) do update set email = excluded.email;

  insert into public.school_app_admins(user_id) values (v_admin) on conflict do nothing;

  select id into v_pl from public.school_planners where kind = 'marista';
  if v_pl is null then
    insert into public.school_planners(name, kind, owner_id)
      values ('Planner Marista', 'marista', v_admin) returning id into v_pl;
  end if;

  update public.school_planner_items set planner_id = v_pl where planner_id is null;

  -- quem já criou/editou provas continua com acesso de edição (você remove quem não deve ter)
  insert into public.school_planner_members(planner_id, user_id, role)
    select v_pl, x.u, 'editor'
    from (select created_by as u from public.school_planner_items
          union select updated_by from public.school_planner_items) x
    where x.u is not null and x.u <> v_admin
      and exists (select 1 from auth.users au where au.id = x.u)
    on conflict do nothing;
end $$;

alter table public.school_planner_items alter column planner_id set not null;
alter table public.school_planner_items drop constraint if exists school_items_planner_fk;
alter table public.school_planner_items
  add constraint school_items_planner_fk
  foreign key (planner_id) references public.school_planners(id) on delete cascade;
create index if not exists school_items_planner_date_idx
  on public.school_planner_items(planner_id, exam_date);

-- 4) RPCs (toda escrita de usuários/planners passa por aqui) ------------
create or replace function public.sp_ensure_profile() returns void
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if auth.uid() is null then return; end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  if v_email is null then return; end if;
  insert into public.school_planner_profiles(user_id, email) values (auth.uid(), v_email)
    on conflict (user_id) do update set email = excluded.email;
  insert into public.school_planner_members(planner_id, user_id, role)
    select i.planner_id, auth.uid(), i.role from public.school_planner_invites i where i.email = v_email
    on conflict do nothing;
  delete from public.school_planner_invites where email = v_email;
end $$;

create or replace function public.sp_my_planners()
returns table(planner_id uuid, name text, kind text, role text, owner_email text,
              member_count bigint, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select pl.id, pl.name, pl.kind, public.sp_role(pl.id),
         case when public.sp_is_app_admin()
              then (select p.email from public.school_planner_profiles p where p.user_id = pl.owner_id) end,
         (select count(*) from public.school_planner_members m where m.planner_id = pl.id and m.active),
         pl.created_at
  from public.school_planners pl
  where public.sp_role(pl.id) is not null
  order by (pl.kind = 'marista') desc, pl.name;
$$;

create or replace function public.sp_create_planner(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int; v_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'Faça login para criar um planner.'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'O nome precisa ter de 2 a 80 caracteres.'; end if;
  select count(*) into v_n from public.school_planners pl where pl.owner_id = auth.uid() and pl.kind = 'generico';
  if v_n >= 5 and not public.sp_is_app_admin() then raise exception 'Limite de 5 planners por usuário.'; end if;
  insert into public.school_planners(name, kind, owner_id) values (v_name, 'generico', auth.uid()) returning id into v_id;
  insert into public.school_planner_members(planner_id, user_id, role) values (v_id, auth.uid(), 'admin');
  return v_id;
end $$;

create or replace function public.sp_rename_planner(p_planner uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.sp_can_manage(p_planner) then raise exception 'Sem permissão para gerenciar este planner.'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'O nome precisa ter de 2 a 80 caracteres.'; end if;
  update public.school_planners set name = v_name where id = p_planner;
end $$;

create or replace function public.sp_delete_planner(p_planner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_kind text; v_owner uuid;
begin
  select pl.kind, pl.owner_id into v_kind, v_owner from public.school_planners pl where pl.id = p_planner;
  if v_kind is null then raise exception 'Planner não encontrado.'; end if;
  if v_kind = 'marista' then raise exception 'O planner Marista não pode ser excluído.'; end if;
  if not (public.sp_is_app_admin() or v_owner = auth.uid()) then
    raise exception 'Somente o dono do planner ou o administrador geral pode excluí-lo.';
  end if;
  delete from public.school_planners where id = p_planner;   -- apaga provas, membros e convites (cascade)
end $$;

create or replace function public.sp_members(p_planner uuid)
returns table(r_user_id uuid, r_email text, r_role text, r_active boolean,
              r_is_owner boolean, r_pending boolean, r_invite_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sp_can_manage(p_planner) then raise exception 'Sem permissão para gerenciar este planner.'; end if;
  return query
    select * from (
      select m.user_id, coalesce(p.email, '(sem e-mail)'), m.role, m.active,
             (pl.owner_id = m.user_id), false, null::uuid
      from public.school_planner_members m
      join public.school_planners pl on pl.id = m.planner_id
      left join public.school_planner_profiles p on p.user_id = m.user_id
      where m.planner_id = p_planner
      union all
      select null::uuid, i.email, i.role, true, false, true, i.id
      from public.school_planner_invites i where i.planner_id = p_planner
    ) t order by 6, 2;
end $$;

create or replace function public.sp_update_member(p_planner uuid, p_user uuid, p_role text, p_active boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v_kind text;
begin
  if not public.sp_can_manage(p_planner) then raise exception 'Sem permissão para gerenciar este planner.'; end if;
  if p_role not in ('leitor','editor','admin') then raise exception 'Papel inválido.'; end if;
  select pl.kind into v_kind from public.school_planners pl where pl.id = p_planner;
  if v_kind = 'marista' and p_role = 'admin' then
    raise exception 'No planner Marista use Leitor ou Editor (o administrador geral já gerencia tudo).';
  end if;
  if v_kind = 'generico' and (p_role <> 'admin' or not p_active)
     and exists (select 1 from public.school_planner_members m
                 where m.planner_id = p_planner and m.user_id = p_user and m.role = 'admin' and m.active)
     and not exists (select 1 from public.school_planner_members m
                     where m.planner_id = p_planner and m.user_id <> p_user and m.role = 'admin' and m.active) then
    raise exception 'O planner precisa ter pelo menos um admin ativo.';
  end if;
  update public.school_planner_members set role = p_role, active = p_active
    where planner_id = p_planner and user_id = p_user;
end $$;

create or replace function public.sp_grant(p_planner uuid, p_email text, p_role text) returns text
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_uid uuid; v_kind text;
begin
  if not public.sp_can_manage(p_planner) then raise exception 'Sem permissão para gerenciar este planner.'; end if;
  if p_role not in ('leitor','editor','admin') then raise exception 'Papel inválido.'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'E-mail inválido.'; end if;
  select pl.kind into v_kind from public.school_planners pl where pl.id = p_planner;
  if v_kind = 'marista' and p_role = 'admin' then
    raise exception 'No planner Marista use Leitor ou Editor (o administrador geral já gerencia tudo).';
  end if;
  select p.user_id into v_uid from public.school_planner_profiles p where lower(p.email) = v_email;
  if v_uid is not null then
    insert into public.school_planner_members(planner_id, user_id, role, active)
      values (p_planner, v_uid, p_role, true) on conflict do nothing;
    perform public.sp_update_member(p_planner, v_uid, p_role, true);
    return 'adicionado';
  end if;
  insert into public.school_planner_invites(planner_id, email, role, invited_by)
    values (p_planner, v_email, p_role, auth.uid())
    on conflict (planner_id, email) do update set role = excluded.role;
  return 'convite';
end $$;

create or replace function public.sp_remove_member(p_planner uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_kind text;
begin
  if not public.sp_can_manage(p_planner) then raise exception 'Sem permissão para gerenciar este planner.'; end if;
  select pl.kind into v_kind from public.school_planners pl where pl.id = p_planner;
  if v_kind = 'generico'
     and exists (select 1 from public.school_planner_members m
                 where m.planner_id = p_planner and m.user_id = p_user and m.role = 'admin' and m.active)
     and not exists (select 1 from public.school_planner_members m
                     where m.planner_id = p_planner and m.user_id <> p_user and m.role = 'admin' and m.active) then
    raise exception 'O planner precisa ter pelo menos um admin ativo.';
  end if;
  delete from public.school_planner_members where planner_id = p_planner and user_id = p_user;
end $$;

create or replace function public.sp_remove_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_planner uuid;
begin
  select i.planner_id into v_planner from public.school_planner_invites i where i.id = p_invite;
  if v_planner is null then return; end if;
  if not public.sp_can_manage(v_planner) then raise exception 'Sem permissão para gerenciar este planner.'; end if;
  delete from public.school_planner_invites where id = p_invite;
end $$;

-- 5) Cadastro novo: cria perfil e aceita convites (nunca bloqueia o cadastro) --
create or replace function public.sp_on_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.email is not null then
      insert into public.school_planner_profiles(user_id, email) values (new.id, lower(new.email))
        on conflict (user_id) do update set email = excluded.email;
      insert into public.school_planner_members(planner_id, user_id, role)
        select i.planner_id, new.id, i.role from public.school_planner_invites i where i.email = lower(new.email)
        on conflict do nothing;
      delete from public.school_planner_invites where email = lower(new.email);
    end if;
  exception when others then
    null;  -- erro aqui jamais pode impedir o cadastro nos outros apps do projeto
  end;
  return new;
end $$;
drop trigger if exists sp_on_user_created on auth.users;
create trigger sp_on_user_created after insert on auth.users
  for each row execute function public.sp_on_user_created();

-- 6) Segurança (RLS) ----------------------------------------------------
alter table public.school_planners enable row level security;
alter table public.school_planner_members enable row level security;
alter table public.school_planner_profiles enable row level security;
alter table public.school_planner_invites enable row level security;
alter table public.school_app_admins enable row level security;
alter table public.school_planner_items enable row level security;

revoke all on public.school_planner_members, public.school_planner_profiles,
              public.school_planner_invites, public.school_app_admins from anon, authenticated;
revoke all on public.school_planners from anon;
revoke insert, update, delete on public.school_planners from authenticated;
grant select on public.school_planners to authenticated;

drop policy if exists "sp planners select" on public.school_planners;
create policy "sp planners select" on public.school_planners
  for select to authenticated using (public.sp_role(id) is not null);

-- remove as políticas antigas (qualquer usuário logado via tudo)
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'school_planner_items' loop
    execute format('drop policy %I on public.school_planner_items', p.policyname);
  end loop;
end $$;

create policy "sp items select" on public.school_planner_items
  for select to authenticated using (public.sp_role(planner_id) is not null);
create policy "sp items insert" on public.school_planner_items
  for insert to authenticated
  with check (public.sp_role(planner_id) in ('editor','admin') and created_by = auth.uid());
create policy "sp items update" on public.school_planner_items
  for update to authenticated
  using (public.sp_role(planner_id) in ('editor','admin'))
  with check (public.sp_role(planner_id) in ('editor','admin') and updated_by = auth.uid());
create policy "sp items delete" on public.school_planner_items
  for delete to authenticated using (public.sp_role(planner_id) in ('editor','admin'));

-- funções: só usuários logados podem chamar
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'sp\_%' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

commit;

-- =====================================================================
-- CONFERÊNCIA (rode depois, separadamente):
--   select name, kind from public.school_planners;
--   select p.email, m.role, m.active from public.school_planner_members m
--     join public.school_planner_profiles p on p.user_id = m.user_id;
--   select count(*) as sem_planner from public.school_planner_items where planner_id is null; -- deve ser 0
--
-- DESFAZER (emergência): recria a política aberta antiga e mantém as tabelas novas.
--   drop policy if exists "sp items select" on public.school_planner_items; (e as outras 3)
--   create policy "aberta" on public.school_planner_items for all to authenticated using (true) with check (true);
-- =====================================================================
