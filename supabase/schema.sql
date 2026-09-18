-- Scramble leaderboard. Applied by the owner in the Supabase SQL editor.
--
-- One table serves both boards. `day` is set only for Daily Special runs, and is the
-- sole discriminator: the all-time board ignores it, the daily board filters on it.
-- Mode is deliberately absent -- in session.js the player and the bot hold independent
-- `used` sets, so the opponent never changes what the player can score, which makes a
-- Classic run and a vs-Carl run directly comparable.

create table scores (
  id          bigint generated always as identity primary key,
  name        text not null check (name ~ '^[A-Z]{1,12}$'),
  score       integer not null check (score >= 0 and score <= 3000000),
  seed        bigint not null,
  day         date,
  device_id   uuid not null,
  created_at  timestamptz not null default now()
);

-- The daily's real enforcement. Postgres refuses a second row per device per day no
-- matter what the client does; the localStorage gate is only politeness in front of it.
create unique index one_daily_per_device on scores (day, device_id) where day is not null;

-- Ties break on created_at ascending: the earlier score ranks higher.
create index scores_alltime on scores (score desc, created_at asc);
create index scores_daily on scores (day, score desc, created_at asc) where day is not null;

alter table scores enable row level security;

-- Read and insert only. No update or delete policy exists, so both are denied to the
-- anon key; removing a row needs the dashboard or the service key.
create policy scores_read   on scores for select using (true);
create policy scores_insert on scores for insert with check (true);

-- Scores are client-submitted and unverified by design, so cap the damage a single
-- browser can do to the table. 50/day is far above real play and far below harmful.
create or replace function cap_scores_per_device() returns trigger as $$
begin
  if (select count(*) from scores
       where device_id = new.device_id
         and created_at >= now() - interval '1 day') >= 50 then
    raise exception 'submission cap reached';
  end if;
  return new;
end $$ language plpgsql;

create trigger scores_cap before insert on scores
  for each row execute function cap_scores_per_device();
