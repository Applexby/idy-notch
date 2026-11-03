-- Las funciones de grupos solo para usuarios con sesión; el trigger de alta, para nadie.
revoke execute on function public.create_group(text), public.join_group(text), public.leave_group(uuid), public.is_group_member(uuid) from public, anon;
grant execute on function public.create_group(text), public.join_group(text), public.leave_group(uuid), public.is_group_member(uuid) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
