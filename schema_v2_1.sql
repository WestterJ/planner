-- Planner Escolar Familiar v2.1.0 — lista de todos os usuários para o administrador geral
-- JÁ APLICADO no projeto Bases (migração school_planner_v2_1_sp_all_users). Guardado aqui só como registro/versionamento.
create or replace function public.sp_all_users(p_planner uuid)
returns table(r_user_id uuid, r_email text, r_role text, r_active boolean,
              r_is_owner boolean, r_is_admin boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sp_is_app_admin() then
    raise exception 'Somente o administrador geral pode listar todos os usuários.';
  end if;
  return query
    select p.user_id, p.email, m.role, m.active,
           coalesce(pl.owner_id = p.user_id, false),
           exists (select 1 from public.school_app_admins a where a.user_id = p.user_id)
    from public.school_planner_profiles p
    left join public.school_planner_members m on m.planner_id = p_planner and m.user_id = p.user_id
    left join public.school_planners pl on pl.id = p_planner
    order by 6 desc, 2;
end $$;
revoke all on function public.sp_all_users(uuid) from public, anon;
grant execute on function public.sp_all_users(uuid) to authenticated;
