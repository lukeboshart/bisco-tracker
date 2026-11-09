-- Bisco Tracker database schema.
-- Run this once in Supabase → SQL Editor → New query → Run.

-- Shows each person went to. Row-level security keeps every row private to its owner.
create table if not exists public.user_shows (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  show_date   date not null,
  venue       text not null default '',
  city        text not null default '',
  bip_slug    text,
  setlist     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, bip_slug)
);

create index if not exists user_shows_user_date on public.user_shows (user_id, show_date);

alter table public.user_shows enable row level security;

drop policy if exists "read own shows" on public.user_shows;
drop policy if exists "add own shows" on public.user_shows;
drop policy if exists "edit own shows" on public.user_shows;
drop policy if exists "delete own shows" on public.user_shows;

create policy "read own shows"   on public.user_shows for select using (auth.uid() = user_id);
create policy "add own shows"    on public.user_shows for insert with check (auth.uid() = user_id);
create policy "edit own shows"   on public.user_shows for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own shows" on public.user_shows for delete using (auth.uid() = user_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists user_shows_touch on public.user_shows;
create trigger user_shows_touch before update on public.user_shows
  for each row execute function public.touch_updated_at();

-- Cache of data fetched from the Bisco Internet Project, so BIP is asked once per
-- year/show instead of once per visitor. Only the server (service role) reads and writes these:
-- RLS is on and there are no policies, so browsers can't touch them.
create table if not exists public.bip_years (
  year        int primary key,
  shows       jsonb not null,
  fetched_at  timestamptz not null default now()
);

create table if not exists public.bip_setlists (
  slug        text primary key,
  setlist     jsonb not null,
  fetched_at  timestamptz not null default now()
);

alter table public.bip_years enable row level security;
alter table public.bip_setlists enable row level security;
