-- IDY Notch · esquema inicial
-- Usuarios (perfiles), grupos de amigos, recordatorios, notas, tareas y suscripciones push.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ───────────────────────── Perfiles ─────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_.]{3,24}$'),
  display_name text,
  timezone     text not null default 'America/Lima',
  created_at   timestamptz not null default now()
);

-- Crea el perfil automáticamente al registrar un usuario
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))),
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'username')
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── Grupos ─────────────────────────
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 60),
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  owner_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at  timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index on public.group_members (user_id);

create function public.is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = (select auth.uid()));
$$;

create function public.create_group(group_name text) returns public.groups
language plpgsql security definer set search_path = '' as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.groups (name, owner_id) values (group_name, auth.uid()) returning * into g;
  insert into public.group_members (group_id, user_id, role) values (g.id, auth.uid(), 'owner');
  return g;
end $$;

create function public.join_group(code text) returns public.groups
language plpgsql security definer set search_path = '' as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into g from public.groups where invite_code = upper(trim(code));
  if g.id is null then raise exception 'Código de grupo no válido'; end if;
  insert into public.group_members (group_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  return g;
end $$;

create function public.leave_group(gid uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.group_members where group_id = gid and user_id = (select auth.uid());
$$;

-- ───────────────────────── Recordatorios ─────────────────────────
create table public.reminders (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  group_id      uuid references public.groups(id) on delete cascade,
  title         text not null check (length(title) between 1 and 200),
  notes         text,
  fire_at       timestamptz not null,          -- primera vez
  next_fire_at  timestamptz,                   -- próxima vez (null = ya terminó)
  repeat        text not null default 'none' check (repeat in ('none','daily','weekdays','weekly','monthly')),
  timezone      text not null default 'America/Lima',
  alarm         boolean not null default true, -- true = suena como alarma en el notch
  color         text not null default 'orange',
  last_fired_at timestamptz,
  done          boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index reminders_due_idx on public.reminders (next_fire_at) where not done;
create index on public.reminders (owner_id);
create index on public.reminders (group_id);

create function public.reminders_defaults() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.fire_at is distinct from old.fire_at then
    if new.next_fire_at is null or tg_op = 'UPDATE' then new.next_fire_at := new.fire_at; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger reminders_defaults before insert or update on public.reminders
  for each row execute function public.reminders_defaults();

-- Calcula la siguiente ocurrencia respetando la zona horaria del recordatorio
create function public.next_occurrence(ts timestamptz, rep text, tz text) returns timestamptz
language plpgsql immutable set search_path = '' as $$
declare local_ts timestamp := ts at time zone tz;
begin
  case rep
    when 'daily'   then local_ts := local_ts + interval '1 day';
    when 'weekly'  then local_ts := local_ts + interval '1 week';
    when 'monthly' then local_ts := local_ts + interval '1 month';
    when 'weekdays' then
      local_ts := local_ts + interval '1 day';
      while extract(isodow from local_ts) > 5 loop local_ts := local_ts + interval '1 day'; end loop;
    else return null;
  end case;
  return local_ts at time zone tz;
end $$;

-- ───────────────────────── Notas (tipo Keep) ─────────────────────────
create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  group_id   uuid references public.groups(id) on delete cascade,
  title      text not null default '',
  body       text not null default '',
  checklist  jsonb not null default '[]'::jsonb, -- [{id, text, done}]
  color      text not null default 'default',
  pinned     boolean not null default false,
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.notes (owner_id);
create index on public.notes (group_id);

-- ───────────────────────── Tareas ─────────────────────────
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  group_id     uuid references public.groups(id) on delete cascade,
  title        text not null check (length(title) between 1 and 300),
  notes        text,
  due_at       timestamptz,              -- hora de inicio / recordatorio
  duration_min int,                      -- para avisar "se acabó el tiempo"
  priority     smallint not null default 0 check (priority between 0 and 3),
  color        text not null default 'blue',
  done         boolean not null default false,
  completed_at timestamptz,
  position     double precision not null default extract(epoch from now()),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.tasks (owner_id);
create index on public.tasks (group_id);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger notes_touch before update on public.notes for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();

-- ───────────────────────── Push (Web Push / iPhone) ─────────────────────────
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions (user_id);

-- Secretos internos (VAPID, cron, invitación). Solo service_role los lee.
create table public.app_secrets (
  key   text primary key,
  value text not null
);

-- ───────────────────────── Seguridad (RLS) ─────────────────────────
alter table public.profiles           enable row level security;
alter table public.groups             enable row level security;
alter table public.group_members      enable row level security;
alter table public.reminders          enable row level security;
alter table public.notes              enable row level security;
alter table public.tasks              enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.app_secrets        enable row level security;
revoke all on public.app_secrets from anon, authenticated;

create policy "perfiles visibles para usuarios" on public.profiles
  for select to authenticated using (true);
create policy "editar mi perfil" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "ver mis grupos" on public.groups
  for select to authenticated using (public.is_group_member(id));
create policy "renombrar mi grupo" on public.groups
  for update to authenticated using (owner_id = (select auth.uid()));
create policy "borrar mi grupo" on public.groups
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "ver miembros de mis grupos" on public.group_members
  for select to authenticated using (public.is_group_member(group_id));

-- Política común para reminders / notes / tasks
do $$
declare t text;
begin
  foreach t in array array['reminders','notes','tasks'] loop
    execute format($f$
      create policy "leer %1$s" on public.%1$I for select to authenticated
        using (owner_id = (select auth.uid()) or (group_id is not null and public.is_group_member(group_id)));
      create policy "crear %1$s" on public.%1$I for insert to authenticated
        with check (owner_id = (select auth.uid()) and (group_id is null or public.is_group_member(group_id)));
      create policy "editar %1$s" on public.%1$I for update to authenticated
        using (owner_id = (select auth.uid()) or (group_id is not null and public.is_group_member(group_id)))
        with check (group_id is null or public.is_group_member(group_id));
      create policy "borrar %1$s" on public.%1$I for delete to authenticated
        using (owner_id = (select auth.uid()) or (group_id is not null and public.is_group_member(group_id)));
    $f$, t);
  end loop;
end $$;

create policy "mis suscripciones" on public.push_subscriptions
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ───────────────────────── Disparo de recordatorios ─────────────────────────
-- Marca como disparados los recordatorios vencidos, avanza los repetitivos y
-- devuelve a quién hay que notificar. Lo llama la Edge Function cada minuto.
create function public.claim_due_reminders()
returns table (reminder_id uuid, title text, notes text, group_name text, user_ids uuid[], fired_for timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select r.* from public.reminders r
    where not r.done and r.next_fire_at is not null and r.next_fire_at <= now()
    for update skip locked
  ),
  upd as (
    update public.reminders r set
      last_fired_at = due.next_fire_at,
      next_fire_at  = public.next_occurrence(due.next_fire_at, due.repeat, due.timezone),
      done = (due.repeat = 'none')
    from due where r.id = due.id
    returning r.id, due.next_fire_at as fired_for
  )
  select d.id, d.title, d.notes, g.name,
    case when d.group_id is null then array[d.owner_id]
         else (select array_agg(m.user_id) from public.group_members m where m.group_id = d.group_id) end,
    u.fired_for
  from due d join upd u on u.id = d.id
  left join public.groups g on g.id = d.group_id
  where d.next_fire_at > now() - interval '6 hours'; -- no notificar cosas muy viejas
end $$;
revoke execute on function public.claim_due_reminders() from public, anon, authenticated;

-- ───────────────────────── Realtime ─────────────────────────
alter publication supabase_realtime add table public.reminders, public.tasks, public.notes;
