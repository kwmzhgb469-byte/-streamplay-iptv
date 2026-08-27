create table if not exists public.playlists(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,name text not null,created_at timestamptz not null default now());
create table if not exists public.channels(id uuid primary key default gen_random_uuid(),playlist_id uuid not null references public.playlists(id) on delete cascade,name text not null,url text not null,group_name text,logo text,epg_id text,created_at timestamptz not null default now());
create table if not exists public.favorites(user_id uuid not null references auth.users(id) on delete cascade,channel_id uuid not null references public.channels(id) on delete cascade,created_at timestamptz not null default now(),primary key(user_id,channel_id));
alter table public.playlists enable row level security; alter table public.channels enable row level security; alter table public.favorites enable row level security;
create policy "own playlists" on public.playlists for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "own channels read" on public.channels for select using(exists(select 1 from public.playlists p where p.id=playlist_id and p.user_id=auth.uid()));
create policy "own channels insert" on public.channels for insert with check(exists(select 1 from public.playlists p where p.id=playlist_id and p.user_id=auth.uid()));
create policy "own favorites" on public.favorites for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
