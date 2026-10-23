-- =====================================================================
-- 부서 목록 — 예약의 '사용 부서'를 정해진 목록에서 고르게 해 이름이 흩어지지 않게 한다
-- (reservations.department 는 그대로 text. 목록은 고르는 데만 쓰고, 이름을 바꾸면 예약도 함께 바꾼다)
-- 겹침 알림 — 반복 예약 미리보기에 겹치는 예약의 부서도 돌려준다
-- =====================================================================

create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) > 0),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
comment on table public.departments is '예약 사용 부서 목록. 삭제 대신 is_active=false 로 숨김';

alter table public.departments enable row level security;
drop policy if exists departments_public_select on public.departments;
create policy departments_public_select on public.departments for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists departments_admin_write on public.departments;
create policy departments_admin_write on public.departments for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.departments to anon, authenticated;

-- 처음 목록 (관리자 화면 '부서 관리'에서 고치고 늘릴 수 있음)
insert into public.departments (name, sort_order) values
  ('차세대', 10), ('대학청년부', 20), ('대청', 30), ('모자이크', 40), ('파워웨이브', 50),
  ('유치부', 60), ('유년부', 70), ('초등부', 80), ('소년부', 90),
  ('여성사역', 100), ('예배인도팀', 110), ('미디어팀', 120), ('세례팀', 130),
  ('전도사역팀', 140), ('노방전도팀', 150), ('한국어선교팀', 160), ('기타', 1000)
on conflict (name) do nothing;

-- 예약에 쓰인 부서 이름별 건수 (부서 정리 화면용, 관리자 전용 — RLS 적용)
create or replace function public.department_usage()
returns table (department text, reservation_count bigint, sample_title text, last_used timestamptz)
language sql stable security invoker set search_path = public as $$
  select r.department, count(*), (array_agg(r.title order by r.start_at desc))[1], max(r.start_at)
  from public.reservations r
  group by r.department
  order by count(*) desc;
$$;
grant execute on function public.department_usage() to authenticated;

-- 반복 예약 미리보기: 겹치는 예약의 부서도 (반환 형식이 바뀌므로 지우고 다시 만든다)
drop function if exists public.preview_recurring(uuid, timestamptz, timestamptz, integer);
create function public.preview_recurring(
  p_room_id uuid, p_start timestamptz, p_end timestamptz, p_count integer
) returns table (seq integer, start_at timestamptz, end_at timestamptz,
                 conflict_id uuid, conflict_title text, conflict_start timestamptz, conflict_end timestamptz,
                 conflict_department text)
language sql stable security invoker set search_path = public as $$
  with occ as (
    select g as seq,
           p_start + (g * interval '7 days') as s,
           p_end   + (g * interval '7 days') as e
    from generate_series(0, greatest(p_count, 1) - 1) g
  )
  select occ.seq, occ.s, occ.e, c.id, c.title, c.start_at, c.end_at, c.department
  from occ
  left join lateral (
    select r.id, r.title, r.start_at, r.end_at, r.department
    from public.reservations r
    where r.room_id = p_room_id
      and tstzrange(r.start_at, r.end_at, '[)') && tstzrange(occ.s, occ.e, '[)')
    order by r.start_at limit 1
  ) c on true
  order by occ.seq;
$$;
grant execute on function public.preview_recurring(uuid, timestamptz, timestamptz, integer) to authenticated;
