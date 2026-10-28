create table public.growth_notes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'Asia/Shanghai')::date,
  text text not null check (char_length(text) between 1 and 5000),
  source text not null default 'web',
  legacy_id bigint,
  created_at timestamptz not null default now(),
  analyzed boolean not null default false
);

create index growth_notes_user_day_idx on public.growth_notes(user_id, day, created_at);
create index growth_notes_pending_idx on public.growth_notes(user_id, day) where not analyzed;
create unique index growth_notes_legacy_idx on public.growth_notes(user_id, source, legacy_id) where legacy_id is not null;

create table public.growth_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  diary text not null,
  branches jsonb not null,
  warmth text not null default '',
  one_line text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

create index growth_entries_user_day_idx on public.growth_entries(user_id, day);

alter table public.growth_notes enable row level security;
alter table public.growth_entries enable row level security;

create policy growth_notes_select on public.growth_notes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy growth_notes_insert on public.growth_notes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy growth_notes_delete on public.growth_notes
  for delete to authenticated using ((select auth.uid()) = user_id);
create policy growth_entries_select on public.growth_entries
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.growth_notes, public.growth_entries from anon;
grant select, insert, delete on public.growth_notes to authenticated;
grant select on public.growth_entries to authenticated;
grant usage, select on sequence public.growth_notes_id_seq to authenticated;

create function public.complete_growth_analysis(
  p_user_id uuid, p_day date, p_note_ids bigint[], p_diary text,
  p_branches jsonb, p_warmth text, p_one_line text
) returns void language plpgsql security definer
set search_path = '' as $$
declare matched_count integer;
begin
  if array_length(p_note_ids, 1) is null then
    raise exception 'No notes to analyze';
  end if;
  with locked as (
    select id from public.growth_notes
      where user_id = p_user_id and day = p_day and not analyzed and id = any(p_note_ids)
      for update
  ) select count(*) into matched_count from locked;
  if matched_count <> array_length(p_note_ids, 1) then
    raise exception 'Notes changed during analysis';
  end if;
  insert into public.growth_entries(user_id, day, diary, branches, warmth, one_line)
    values (p_user_id, p_day, p_diary, p_branches, coalesce(p_warmth, ''), coalesce(p_one_line, ''))
    on conflict(user_id, day) do update set
      diary = excluded.diary,
      branches = excluded.branches,
      warmth = excluded.warmth,
      one_line = excluded.one_line,
      created_at = now();
  update public.growth_notes set analyzed = true
    where user_id = p_user_id and id = any(p_note_ids);
end;
$$;

revoke all on function public.complete_growth_analysis(uuid, date, bigint[], text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.complete_growth_analysis(uuid, date, bigint[], text, jsonb, text, text) to service_role;
