-- 관리자 아이디를 admin1~3 에서 admin1~admin99 로 넓힌다 (사역자가 늘어도 계정 추가 가능)
alter table public.admins drop constraint if exists admins_login_id_check;
alter table public.admins add constraint admins_login_id_check check (login_id ~ '^admin[1-9][0-9]?$');
comment on table public.admins is '관리자 계정(admin1~admin99). auth.users 와 1:1';
