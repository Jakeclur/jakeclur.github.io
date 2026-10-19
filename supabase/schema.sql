-- Run once in Supabase: SQL Editor > New query > paste > Run.
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  status text not null default 'none',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Locked down: only the server (service key) can read or write. Browsers get nothing.
alter table public.subscriptions enable row level security;
