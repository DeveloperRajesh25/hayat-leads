-- ===========================================================================
-- Hayat Interiors — WhatsApp Lead Automation
-- Supabase database schema (tables, indexes, triggers, Row Level Security).
--
-- HOW TO RUN:
--   Supabase Dashboard -> SQL Editor -> paste this file -> Run.
--   The script is idempotent and safe to run more than once.
-- ===========================================================================

-- Extensions ---------------------------------------------------------------
create extension if not exists pgcrypto;          -- gen_random_uuid()

-- Helper: keep updated_at fresh on UPDATE ----------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ===========================================================================
-- 1. profiles  (admin "users" — extends Supabase auth.users)
-- ===========================================================================
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  role       text not null default 'admin',
  created_at timestamptz not null default now()
);

-- Auto-create a profile when a new auth user is added.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- 2. contacts  (leads imported from CSV)
-- ===========================================================================
create table if not exists public.contacts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null,
  token      text not null unique,                 -- per-contact form link token
  source     text default 'csv',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- Prevent duplicate phone numbers.
create unique index if not exists contacts_phone_key on public.contacts (phone);
create index if not exists contacts_created_at_idx on public.contacts (created_at desc);

-- ===========================================================================
-- 3. campaigns
-- ===========================================================================
create table if not exists public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  template_name   text not null,
  template_lang   text,
  image_url       text,
  form_base_url   text,
  message_body    text,
  total_contacts  integer not null default 0,
  messages_sent   integer not null default 0,
  messages_failed integer not null default 0,
  status          text not null default 'draft'
                    check (status in ('draft','sending','completed','failed')),
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  created_by      uuid references auth.users(id) on delete set null
);

-- Migrating an existing database created before batched sending? This adds
-- the column the batch endpoint needs to re-resolve the exact template used,
-- without touching the rest of the table.
alter table public.campaigns add column if not exists template_lang text;

create index if not exists campaigns_created_at_idx on public.campaigns (created_at desc);

-- ===========================================================================
-- 4. messages  (one row per contact per campaign — delivery status)
-- ===========================================================================
create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid references public.campaigns(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete set null,
  phone         text not null,
  wa_message_id text,                              -- Meta message id (wamid…)
  status        text not null default 'pending'
                  check (status in ('pending','sent','delivered','read','failed')),
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists messages_campaign_idx on public.messages (campaign_id);
create index if not exists messages_contact_idx  on public.messages (contact_id);
create index if not exists messages_wa_id_idx     on public.messages (wa_message_id);
-- Batch sending repeatedly pulls the next page of pending rows per campaign.
create index if not exists messages_campaign_status_idx on public.messages (campaign_id, status);

drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- campaign_stats  (LIVE per-campaign delivery breakdown)
-- ---------------------------------------------------------------------------
-- The single source of truth for how a campaign is doing. Counts are derived
-- directly from the `messages` rows every time they're read, so they can never
-- drift the way denormalized counters on the campaigns table did. Every screen
-- (history table, live send panel, status endpoint) reads from here.
--
--   total     = recipients queued for this campaign
--   pending   = not yet sent (queued, or waiting out a rate limit)
--   sent      = accepted by Meta, not yet confirmed delivered
--   delivered = delivered to the handset
--   read      = opened by the recipient
--   failed    = permanently failed for this recipient
--
-- "Accepted by Meta" = sent + delivered + read. "Delivered" = delivered + read.
-- sent + delivered + read + failed + pending always equals total.
create or replace view public.campaign_stats as
select
  c.id                                                as campaign_id,
  c.total_contacts                                    as total,
  count(m.*) filter (where m.status = 'pending')      as pending,
  count(m.*) filter (where m.status = 'sent')         as sent,
  count(m.*) filter (where m.status = 'delivered')    as delivered,
  count(m.*) filter (where m.status = 'read')         as read,
  count(m.*) filter (where m.status = 'failed')       as failed,
  count(m.*)                                          as message_rows
from public.campaigns c
left join public.messages m on m.campaign_id = c.id
group by c.id, c.total_contacts;

grant select on public.campaign_stats to authenticated;

-- ===========================================================================
-- 5. responses  (customer form submissions)
-- ===========================================================================
create table if not exists public.responses (
  id                  uuid primary key default gen_random_uuid(),
  contact_id          uuid references public.contacts(id) on delete set null,
  name                text not null,
  phone               text not null unique,        -- one response per phone
  interest_status     text not null
                        check (interest_status in ('interested','not_interested')),
  requirement_details text,
  notes               text,
  converted           boolean not null default false,
  converted_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Migrating an existing database created before the "converted" tracking
-- feature? These two lines add the columns without touching the rest of the
-- table (safe to run — no-ops when the columns already exist).
alter table public.responses add column if not exists converted boolean not null default false;
alter table public.responses add column if not exists converted_at timestamptz;

create index if not exists responses_created_at_idx on public.responses (created_at desc);
create index if not exists responses_interest_idx   on public.responses (interest_status);
create index if not exists responses_converted_idx  on public.responses (converted);

drop trigger if exists responses_set_updated_at on public.responses;
create trigger responses_set_updated_at
  before update on public.responses
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 6. stat_resets  (per-card dashboard "reset to zero" baselines)
-- ---------------------------------------------------------------------------
-- Each row records the moment an admin reset a dashboard stat card. From then
-- on the card only counts rows created AFTER `reset_at`, so old numbers are
-- hidden and the count effectively starts again from zero.
-- ===========================================================================
create table if not exists public.stat_resets (
  stat_key   text primary key,
  reset_at   timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists stat_resets_set_updated_at on public.stat_resets;
create trigger stat_resets_set_updated_at
  before update on public.stat_resets
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Strategy: lock every table down. Authenticated admins (logged into the
-- dashboard) get full access. The PUBLIC form + webhook never touch these
-- tables directly — they go through server API routes that use the SERVICE
-- ROLE key, which bypasses RLS. The `anon` role therefore gets no policies.
-- ===========================================================================
alter table public.profiles  enable row level security;
alter table public.contacts  enable row level security;
alter table public.campaigns enable row level security;
alter table public.messages  enable row level security;
alter table public.responses enable row level security;
alter table public.stat_resets enable row level security;

-- Make sure the authenticated role has table privileges (RLS still applies).
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.profiles, public.contacts, public.campaigns,
     public.messages, public.responses, public.stat_resets
  to authenticated;

-- profiles: each admin sees only their own profile row.
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- contacts / campaigns / messages / responses: full access for any
-- authenticated admin (single-tenant internal tool).
drop policy if exists contacts_admin_all on public.contacts;
create policy contacts_admin_all on public.contacts
  for all to authenticated using (true) with check (true);

drop policy if exists campaigns_admin_all on public.campaigns;
create policy campaigns_admin_all on public.campaigns
  for all to authenticated using (true) with check (true);

drop policy if exists messages_admin_all on public.messages;
create policy messages_admin_all on public.messages
  for all to authenticated using (true) with check (true);

drop policy if exists responses_admin_all on public.responses;
create policy responses_admin_all on public.responses
  for all to authenticated using (true) with check (true);

drop policy if exists stat_resets_admin_all on public.stat_resets;
create policy stat_resets_admin_all on public.stat_resets
  for all to authenticated using (true) with check (true);

-- ===========================================================================
-- Done. Next:
--   1. Create your admin user:  Dashboard -> Authentication -> Add user
--      (enter email + password, tick "Auto Confirm User").
--      The trigger above creates the matching profiles row automatically.
--   2. Copy your API keys into .env.local (see .env.example).
-- ===========================================================================
