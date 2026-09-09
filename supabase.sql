-- ============================================================
-- SKYRIDE / ROAD CYCLING CLUB
-- Supabase database migration
-- Prefix: rc_
-- Run this whole file in Supabase SQL Editor.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- PROFILES ----------
create table if not exists public.rc_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '라이더',
  avatar_url text,
  role text not null default 'member' check (role in ('member','admin')),
  region text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- EVENTS ----------
create table if not exists public.rc_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('regular','small')),
  title text not null,
  event_date date not null,
  event_time time,
  region text not null,
  meeting_point text not null,
  description text not null default '',
  capacity integer not null default 15 check (capacity between 2 and 200),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- EVENT APPLICATIONS ----------
create table if not exists public.rc_event_applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.rc_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(event_id, user_id)
);

-- ---------- COMMUNITY POSTS ----------
create table if not exists public.rc_posts (
  id uuid primary key default gen_random_uuid(),
  board_type text not null check (board_type in ('notice','free','course')),
  title text not null,
  content text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rc_events_date_idx on public.rc_events(event_date);
create index if not exists rc_events_type_idx on public.rc_events(event_type);
create index if not exists rc_apps_event_idx on public.rc_event_applications(event_id);
create index if not exists rc_posts_board_created_idx on public.rc_posts(board_type, created_at desc);

-- ---------- PROFILE TRIGGER ----------
create or replace function public.rc_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.rc_profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists rc_on_auth_user_created on auth.users;
create trigger rc_on_auth_user_created
after insert on auth.users
for each row execute function public.rc_handle_new_user();

-- ---------- UPDATED_AT TRIGGER ----------
create or replace function public.rc_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rc_profiles_updated_at on public.rc_profiles;
create trigger rc_profiles_updated_at before update on public.rc_profiles for each row execute function public.rc_set_updated_at();
drop trigger if exists rc_events_updated_at on public.rc_events;
create trigger rc_events_updated_at before update on public.rc_events for each row execute function public.rc_set_updated_at();
drop trigger if exists rc_posts_updated_at on public.rc_posts;
create trigger rc_posts_updated_at before update on public.rc_posts for each row execute function public.rc_set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
alter table public.rc_profiles enable row level security;
alter table public.rc_events enable row level security;
alter table public.rc_event_applications enable row level security;
alter table public.rc_posts enable row level security;

-- Remove broad client grants. Then grant only required access.
revoke all on table public.rc_profiles, public.rc_events, public.rc_event_applications, public.rc_posts from anon, authenticated;

grant select on table public.rc_profiles to authenticated;
grant select, insert, update, delete on table public.rc_events to authenticated;
grant select, insert, delete on table public.rc_event_applications to authenticated;
grant select, insert, update, delete on table public.rc_posts to authenticated;

-- ---------- Helper ----------
create or replace function public.rc_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rc_profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- ---------- PROFILE POLICIES ----------
drop policy if exists "rc_profiles_read_authenticated" on public.rc_profiles;
create policy "rc_profiles_read_authenticated"
on public.rc_profiles for select to authenticated using (true);

drop policy if exists "rc_profiles_update_self" on public.rc_profiles;
create policy "rc_profiles_update_self"
on public.rc_profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- ---------- EVENT POLICIES ----------
drop policy if exists "rc_events_read_authenticated" on public.rc_events;
create policy "rc_events_read_authenticated"
on public.rc_events for select to authenticated using (true);

drop policy if exists "rc_events_insert_small_or_admin" on public.rc_events;
create policy "rc_events_insert_small_or_admin"
on public.rc_events for insert to authenticated
with check (
  (event_type = 'small' and created_by = (select auth.uid()))
  or public.rc_is_admin()
);

drop policy if exists "rc_events_update_owner_or_admin" on public.rc_events;
create policy "rc_events_update_owner_or_admin"
on public.rc_events for update to authenticated
using (created_by = (select auth.uid()) or public.rc_is_admin())
with check (created_by = (select auth.uid()) or public.rc_is_admin());

drop policy if exists "rc_events_delete_owner_or_admin" on public.rc_events;
create policy "rc_events_delete_owner_or_admin"
on public.rc_events for delete to authenticated
using (created_by = (select auth.uid()) or public.rc_is_admin());

-- ---------- APPLICATION POLICIES ----------
drop policy if exists "rc_apps_read_authenticated" on public.rc_event_applications;
create policy "rc_apps_read_authenticated"
on public.rc_event_applications for select to authenticated using (true);

drop policy if exists "rc_apps_insert_self" on public.rc_event_applications;
create policy "rc_apps_insert_self"
on public.rc_event_applications for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "rc_apps_delete_self_or_admin" on public.rc_event_applications;
create policy "rc_apps_delete_self_or_admin"
on public.rc_event_applications for delete to authenticated
using (user_id = (select auth.uid()) or public.rc_is_admin());

-- ---------- POST POLICIES ----------
drop policy if exists "rc_posts_read_authenticated" on public.rc_posts;
create policy "rc_posts_read_authenticated"
on public.rc_posts for select to authenticated using (true);

drop policy if exists "rc_posts_insert_self" on public.rc_posts;
create policy "rc_posts_insert_self"
on public.rc_posts for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "rc_posts_update_owner_or_admin" on public.rc_posts;
create policy "rc_posts_update_owner_or_admin"
on public.rc_posts for update to authenticated
using (user_id = (select auth.uid()) or public.rc_is_admin())
with check (user_id = (select auth.uid()) or public.rc_is_admin());

drop policy if exists "rc_posts_delete_owner_or_admin" on public.rc_posts;
create policy "rc_posts_delete_owner_or_admin"
on public.rc_posts for delete to authenticated
using (user_id = (select auth.uid()) or public.rc_is_admin());

-- ============================================================
-- SEED DATA
-- ============================================================
insert into public.rc_events
(event_type,title,event_date,event_time,region,meeting_point,description,capacity,created_by)
select 'regular','SPRING SKY RIDE · 한강–남한산성','2026-04-18','08:00','서울·경기','잠실종합운동장 2번 출구','봄바람을 맞으며 한강에서 남한산성까지 달리는 시즌 오프닝 라이딩입니다.',30, id
from auth.users limit 1
on conflict do nothing;

insert into public.rc_events
(event_type,title,event_date,event_time,region,meeting_point,description,capacity,created_by)
select 'regular','SUMMER BLUE RIDE · 동해안','2026-07-11','06:30','강원','강릉역','푸른 바다와 함께하는 여름 장거리 라이딩. 약 100km 코스.',25, id
from auth.users limit 1
on conflict do nothing;

insert into public.rc_events
(event_type,title,event_date,event_time,region,meeting_point,description,capacity,created_by)
select 'regular','AUTUMN COLOR RIDE · 남한강','2026-10-17','07:30','경기·충북','양평역','가을 단풍길을 따라 달리는 연간 대표 투어.',30, id
from auth.users limit 1
on conflict do nothing;

-- ============================================================
-- ADMIN SETUP
-- After creating your own account, run:
--
-- update public.rc_profiles
-- set role = 'admin'
-- where id = (select id from auth.users where email = 'YOUR_EMAIL@example.com');
--
-- Do NOT put service_role key in the website.
-- ============================================================
