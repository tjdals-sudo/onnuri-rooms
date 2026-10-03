-- =====================================================================
-- 인천 온누리교회 장소 사용 현황 — 초기 스키마
-- 테이블 · 제약조건(중복 예약 차단) · 이력 트리거 · 실시간 알림 · RLS · seed
-- 모든 시각은 timestamptz 로 저장하고 화면에서 Asia/Seoul 로 표시한다.
-- =====================================================================

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- 세션 기본 시간대 (to_char, date_trunc 등 SQL 안 날짜 연산용)
alter database postgres set timezone to 'Asia/Seoul';

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  login_id     text not null unique check (login_id ~ '^admin[1-3]$'),
  display_name text not null default '',
  created_at   timestamptz not null default now()
);
comment on table public.admins is '관리자 계정(admin1~3). auth.users 와 1:1';

create table if not exists public.rooms (
  id            uuid primary key default gen_random_uuid(),
  floor         text not null check (floor in ('B1','1F','2F','3F','4F')),
  name          text not null,
  capacity_text text not null default '',
  capacity_num  integer,
  seating_type  text not null check (seating_type in ('의자','바닥','좌식+의자','밴드실')),
  note          text not null default '',
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (floor, name)
);
comment on table public.rooms is '장소(홀·방). 삭제 대신 is_active=false 로 숨김';

create table if not exists public.reservations (
  id                  uuid primary key default gen_random_uuid(),
  room_id             uuid not null references public.rooms(id),
  title               text not null check (length(trim(title)) > 0),
  department          text not null default '',
  contact_name        text not null default '',
  contact_phone       text not null default '',
  attendees           integer check (attendees is null or attendees >= 0),
  start_at            timestamptz not null,
  end_at              timestamptz not null,
  memo                text not null default '',
  recurrence_group_id uuid,
  created_by          uuid references public.admins(user_id),
  updated_by          uuid references public.admins(user_id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint reservations_time_order check (end_at > start_at),
  constraint reservations_max_length check (end_at - start_at <= interval '7 days'),
  -- ★ 중복 예약 차단: 같은 장소에서 [start, end) 구간이 1분이라도 겹치면 거부 (SQLSTATE 23P01)
  constraint reservations_no_overlap exclude using gist (
    room_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
);
comment on constraint reservations_no_overlap on public.reservations is '같은 장소 시간 겹침 금지';
create index if not exists reservations_start_idx on public.reservations (start_at);
create index if not exists reservations_room_start_idx on public.reservations (room_id, start_at);
create index if not exists reservations_group_idx on public.reservations (recurrence_group_id) where recurrence_group_id is not null;

create table if not exists public.audit_logs (
  id             bigint generated always as identity primary key,
  admin_id       uuid,
  admin_login_id text not null default 'system',
  action         text not null check (action in ('insert','update','delete')),
  target_table   text not null check (target_table in ('reservations','rooms')),
  target_id      uuid not null,
  before_data    jsonb,
  after_data     jsonb,
  created_at     timestamptz not null default now()
);
comment on table public.audit_logs is '변경 이력. 트리거가 자동 기록하며 수정·삭제 불가';
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

create table if not exists public.login_logs (
  id             bigint generated always as identity primary key,
  admin_id       uuid not null,
  admin_login_id text not null,
  event          text not null check (event in ('login','logout')),
  created_at     timestamptz not null default now()
);
comment on table public.login_logs is '관리자 접속 기록(로그인/로그아웃). 수정·삭제 불가';
create index if not exists login_logs_created_idx on public.login_logs (created_at desc);

create table if not exists public.sheet_sync_status (
  target        text primary key,              -- 'YYYY-MM' 또는 'audit'
  status        text not null check (status in ('ok','error')),
  error_message text not null default '',
  synced_at     timestamptz not null default now()
);
comment on table public.sheet_sync_status is 'Google 스프레드시트 동기화 상태(대상별)';

-- ---------------------------------------------------------------------
-- 2. 관리자 판별 함수
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.current_admin_login_id()
returns text language sql stable security definer set search_path = public as $$
  select login_id from public.admins where user_id = auth.uid();
$$;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.current_admin_login_id() to authenticated;

-- ---------------------------------------------------------------------
-- 3. 트리거: 메타 자동 설정 · 변경 이력 · 불변 보호 · 실시간 알림
-- ---------------------------------------------------------------------
create or replace function public.set_reservation_meta()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_reservations_meta on public.reservations;
create trigger trg_reservations_meta
  before insert or update on public.reservations
  for each row execute function public.set_reservation_meta();

create or replace function public.set_room_meta()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_rooms_meta on public.rooms;
create trigger trg_rooms_meta
  before update on public.rooms
  for each row execute function public.set_room_meta();

-- 변경 이력: 화면 코드가 빠뜨려도 DB 가 반드시 기록
create or replace function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_admin_id uuid := auth.uid();
  v_login_id text;
  v_target   uuid;
begin
  select login_id into v_login_id from public.admins where user_id = v_admin_id;
  v_target := case when tg_op = 'DELETE' then old.id else new.id end;
  insert into public.audit_logs (admin_id, admin_login_id, action, target_table, target_id, before_data, after_data)
  values (
    v_admin_id,
    coalesce(v_login_id, 'system'),
    lower(tg_op),
    tg_table_name,
    v_target,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

drop trigger if exists trg_reservations_audit on public.reservations;
create trigger trg_reservations_audit
  after insert or update or delete on public.reservations
  for each row execute function public.write_audit_log();

drop trigger if exists trg_rooms_audit on public.rooms;
create trigger trg_rooms_audit
  after insert or update or delete on public.rooms
  for each row execute function public.write_audit_log();

-- 이력·접속 기록은 수정·삭제 금지
create or replace function public.forbid_change()
returns trigger language plpgsql as $$
begin
  raise exception '% 는 수정·삭제할 수 없습니다', tg_table_name using errcode = 'P0001';
end $$;

drop trigger if exists trg_audit_logs_immutable on public.audit_logs;
create trigger trg_audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.forbid_change();

drop trigger if exists trg_login_logs_immutable on public.login_logs;
create trigger trg_login_logs_immutable
  before update or delete on public.login_logs
  for each row execute function public.forbid_change();

-- 실시간: 개인정보 없는 "바뀌었다" 신호만 공개 채널(rooms-public)로 방송
create or replace function public.broadcast_public_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record := coalesce(new, old);
  payload jsonb;
begin
  if tg_table_name = 'reservations' then
    payload := jsonb_build_object(
      'table', 'reservations', 'op', lower(tg_op), 'id', r.id, 'room_id', r.room_id,
      'start_at', r.start_at, 'end_at', r.end_at
    );
  else
    payload := jsonb_build_object('table', 'rooms', 'op', lower(tg_op), 'id', r.id);
  end if;
  begin
    perform realtime.send(payload, 'change', 'rooms-public', false);
  exception when others then
    -- 실시간 알림 실패가 예약 자체를 막으면 안 된다
    raise warning 'realtime.send failed: %', sqlerrm;
  end;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_reservations_broadcast on public.reservations;
create trigger trg_reservations_broadcast
  after insert or update or delete on public.reservations
  for each row execute function public.broadcast_public_change();

drop trigger if exists trg_rooms_broadcast on public.rooms;
create trigger trg_rooms_broadcast
  after insert or update or delete on public.rooms
  for each row execute function public.broadcast_public_change();

-- ---------------------------------------------------------------------
-- 4. 공개용 뷰 (연락처·담당자·메모 제외) — 소유자 권한으로 실행되어 RLS 를 우회하므로
--    anon 은 이 뷰와 rooms 만 읽을 수 있다.
-- ---------------------------------------------------------------------
create or replace view public.reservations_public as
  select
    r.id,
    r.room_id,
    m.floor,
    m.name as room_name,
    m.seating_type,
    m.capacity_text,
    r.title,
    r.department,
    r.attendees,
    r.start_at,
    r.end_at,
    r.recurrence_group_id
  from public.reservations r
  join public.rooms m on m.id = r.room_id
  where m.is_active;
comment on view public.reservations_public is '공개 조회용. 개인정보 컬럼 없음';

-- ---------------------------------------------------------------------
-- 5. 관리자용 함수 (충돌 조회 · 반복 예약)
-- ---------------------------------------------------------------------
-- 겹치는 예약 목록 (관리자 전용, RLS 적용)
create or replace function public.find_conflicts(
  p_room_id uuid, p_start timestamptz, p_end timestamptz, p_exclude_id uuid default null
) returns table (id uuid, title text, department text, start_at timestamptz, end_at timestamptz,
                 floor text, room_name text)
language sql stable security invoker set search_path = public as $$
  select r.id, r.title, r.department, r.start_at, r.end_at, m.floor, m.name
  from public.reservations r join public.rooms m on m.id = r.room_id
  where r.room_id = p_room_id
    and tstzrange(r.start_at, r.end_at, '[)') && tstzrange(p_start, p_end, '[)')
    and (p_exclude_id is null or r.id <> p_exclude_id)
  order by r.start_at;
$$;

-- 반복 예약 미리보기: 각 회차의 시작/종료와 충돌 예약
create or replace function public.preview_recurring(
  p_room_id uuid, p_start timestamptz, p_end timestamptz, p_count integer
) returns table (seq integer, start_at timestamptz, end_at timestamptz,
                 conflict_id uuid, conflict_title text, conflict_start timestamptz, conflict_end timestamptz)
language sql stable security invoker set search_path = public as $$
  with occ as (
    select g as seq,
           p_start + (g * interval '7 days') as s,
           p_end   + (g * interval '7 days') as e
    from generate_series(0, greatest(p_count, 1) - 1) g
  )
  select occ.seq, occ.s, occ.e, c.id, c.title, c.start_at, c.end_at
  from occ
  left join lateral (
    select r.id, r.title, r.start_at, r.end_at
    from public.reservations r
    where r.room_id = p_room_id
      and tstzrange(r.start_at, r.end_at, '[)') && tstzrange(occ.s, occ.e, '[)')
    order by r.start_at limit 1
  ) c on true
  order by occ.seq;
$$;

-- 반복 예약 일괄 등록 (한 트랜잭션). p_skip_conflicts=true 면 충돌 회차는 건너뛴다.
create or replace function public.create_recurring(
  p_room_id uuid, p_title text, p_department text, p_contact_name text, p_contact_phone text,
  p_attendees integer, p_memo text, p_start timestamptz, p_end timestamptz, p_count integer,
  p_skip_conflicts boolean default true
) returns table (created_ids uuid[], skipped_seqs integer[], group_id uuid)
language plpgsql security invoker set search_path = public as $$
declare
  v_group   uuid := gen_random_uuid();
  v_ids     uuid[] := '{}';
  v_skipped integer[] := '{}';
  v_s timestamptz; v_e timestamptz; v_id uuid; i integer;
begin
  if not public.is_admin() then
    raise exception '관리자만 사용할 수 있습니다' using errcode = '42501';
  end if;
  if p_count < 1 or p_count > 104 then
    raise exception '반복 횟수는 1~104회 사이여야 합니다';
  end if;
  for i in 0 .. p_count - 1 loop
    v_s := p_start + (i * interval '7 days');
    v_e := p_end   + (i * interval '7 days');
    if p_skip_conflicts and exists (
      select 1 from public.reservations r
      where r.room_id = p_room_id and tstzrange(r.start_at, r.end_at, '[)') && tstzrange(v_s, v_e, '[)')
    ) then
      v_skipped := v_skipped || i;
      continue;
    end if;
    insert into public.reservations (room_id, title, department, contact_name, contact_phone, attendees,
                                     start_at, end_at, memo, recurrence_group_id)
    values (p_room_id, p_title, coalesce(p_department,''), coalesce(p_contact_name,''), coalesce(p_contact_phone,''),
            p_attendees, v_s, v_e, coalesce(p_memo,''), v_group)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;
  return query select v_ids, v_skipped, v_group;
end $$;

-- 반복 예약 "이후 전체" 수정: 기준 회차(p_id) 이후 같은 그룹을 동일 내용·동일 시간 이동량으로 변경
create or replace function public.update_recurring_from(
  p_id uuid, p_title text, p_department text, p_contact_name text, p_contact_phone text,
  p_attendees integer, p_memo text, p_start timestamptz, p_end timestamptz
) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  v_base public.reservations%rowtype;
  v_delta interval;
  v_dur   interval;
  v_count integer;
begin
  select * into v_base from public.reservations where id = p_id;
  if not found then
    raise exception '예약을 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  v_delta := p_start - v_base.start_at;
  v_dur   := p_end - p_start;
  if v_base.recurrence_group_id is null then
    update public.reservations set title=p_title, department=coalesce(p_department,''),
      contact_name=coalesce(p_contact_name,''), contact_phone=coalesce(p_contact_phone,''),
      attendees=p_attendees, memo=coalesce(p_memo,''), start_at=p_start, end_at=p_end
    where id = p_id;
    return 1;
  end if;
  -- 겹침 제약 때문에 순서에 따라 일시적으로 충돌할 수 있으므로 지연 검사 대신 두 단계로 이동
  update public.reservations
     set title=p_title, department=coalesce(p_department,''),
         contact_name=coalesce(p_contact_name,''), contact_phone=coalesce(p_contact_phone,''),
         attendees=p_attendees, memo=coalesce(p_memo,''),
         start_at = start_at + v_delta, end_at = start_at + v_delta + v_dur
   where recurrence_group_id = v_base.recurrence_group_id and start_at >= v_base.start_at;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- 반복 예약 "이후 전체" 삭제
create or replace function public.delete_recurring_from(p_id uuid)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  v_base public.reservations%rowtype;
  v_count integer;
begin
  select * into v_base from public.reservations where id = p_id;
  if not found then
    raise exception '예약을 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if v_base.recurrence_group_id is null then
    delete from public.reservations where id = p_id;
    return 1;
  end if;
  delete from public.reservations
   where recurrence_group_id = v_base.recurrence_group_id and start_at >= v_base.start_at;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

grant execute on function public.find_conflicts(uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.preview_recurring(uuid, timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.create_recurring(uuid, text, text, text, text, integer, text, timestamptz, timestamptz, integer, boolean) to authenticated;
grant execute on function public.update_recurring_from(uuid, text, text, text, text, integer, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.delete_recurring_from(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
alter table public.admins            enable row level security;
alter table public.rooms             enable row level security;
alter table public.reservations      enable row level security;
alter table public.audit_logs        enable row level security;
alter table public.login_logs        enable row level security;
alter table public.sheet_sync_status enable row level security;

-- admins: 관리자끼리만 조회 (이름 표시용)
drop policy if exists admins_select on public.admins;
create policy admins_select on public.admins for select to authenticated using (public.is_admin());

-- rooms: 누구나 활성 장소 조회, 관리자는 전부 + 쓰기
drop policy if exists rooms_public_select on public.rooms;
create policy rooms_public_select on public.rooms for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists rooms_admin_write on public.rooms;
create policy rooms_admin_write on public.rooms for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- reservations: 관리자만 (일반 사용자는 reservations_public 뷰로만)
drop policy if exists reservations_admin_all on public.reservations;
create policy reservations_admin_all on public.reservations for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- audit_logs: 관리자 조회만. insert 는 security definer 트리거가 수행
drop policy if exists audit_logs_admin_select on public.audit_logs;
create policy audit_logs_admin_select on public.audit_logs for select to authenticated using (public.is_admin());

-- login_logs: 관리자 조회, 본인 기록 insert
drop policy if exists login_logs_admin_select on public.login_logs;
create policy login_logs_admin_select on public.login_logs for select to authenticated using (public.is_admin());
drop policy if exists login_logs_self_insert on public.login_logs;
create policy login_logs_self_insert on public.login_logs for insert to authenticated
  with check (public.is_admin() and admin_id = auth.uid());

-- sheet_sync_status: 관리자 조회 (쓰기는 서버의 service role)
drop policy if exists sheet_sync_admin_select on public.sheet_sync_status;
create policy sheet_sync_admin_select on public.sheet_sync_status for select to authenticated using (public.is_admin());

-- 뷰 권한
grant select on public.reservations_public to anon, authenticated;
grant select on public.rooms to anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. seed: 장소 15곳
-- ---------------------------------------------------------------------
insert into public.rooms (floor, name, capacity_text, capacity_num, seating_type, sort_order) values
  ('B1', '시온홀',            '30~40명',   40,  '의자',      10),
  ('1F', '누리홀',            '50명',      50,  '바닥',      20),
  ('1F', '샤이닝홀',          '50명 이상', 50,  '바닥',      21),
  ('1F', '꿈아이홀',          '50명 이상', 50,  '바닥',      22),
  ('1F', '사랑홀',            '20명',      20,  '좌식+의자', 23),
  ('2F', '기쁨홀',            '50명 이상', 50,  '의자',      30),
  ('2F', '드림홀',            '50명 이상', 50,  '바닥',      31),
  ('2F', '밴드 연습실',       '15명',      15,  '밴드실',    32),
  ('3F', '소망홀',            '200명',     200, '의자',      40),
  ('3F', '믿음홀',            '50명 이상', 50,  '의자',      41),
  ('3F', '로잔홀',            '20명',      20,  '의자',      42),
  ('4F', '식당',              '100명 이상',100, '의자',      50),
  ('4F', '오병이어1(왼쪽)',   '20명',      20,  '의자',      51),
  ('4F', '오병이어2(오른쪽)', '20명',      20,  '의자',      52),
  ('4F', '401·402호',         '30명',      30,  '의자',      53)
on conflict (floor, name) do nothing;
