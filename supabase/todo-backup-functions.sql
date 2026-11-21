-- Run once in Supabase SQL Editor. Adds functions only; no table/data migration.
-- Both functions use the caller's permissions and existing RLS policies.
begin;

create or replace function public.todo_append_backup(
  p_id uuid, p_expected_id uuid, p_schema_version integer, p_backup_data jsonb, p_user_id uuid
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_existing public.app_backups%rowtype;
  v_latest public.app_backups%rowtype;
  v_saved public.app_backups%rowtype;
begin
  if v_user is null or v_user is distinct from p_user_id then raise exception 'Authentication required'; end if;
  -- Check JSON types before inspecting values. No cast of untrusted JSON text.
  if jsonb_typeof(p_backup_data) is distinct from 'object' then
    raise exception 'Invalid todo backup';
  end if;
  if jsonb_typeof(p_backup_data->'version') is distinct from 'number' then
    raise exception 'Invalid todo backup version';
  end if;
  if p_schema_version is null or p_schema_version <> 1
     or (p_backup_data->'version') is distinct from to_jsonb(p_schema_version) then
    raise exception 'Invalid todo backup version';
  end if;
  if jsonb_typeof(p_backup_data->'tasks') is distinct from 'array'
     or jsonb_typeof(p_backup_data->'groups') is distinct from 'array'
     or jsonb_typeof(p_backup_data->'settings') is distinct from 'object' then
    raise exception 'Invalid todo backup';
  end if;
  if jsonb_array_length(p_backup_data->'tasks') = 0
     and jsonb_array_length(p_backup_data->'groups') = 0 then
    raise exception 'Empty todo backup is not allowed';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':todo', 0));
  select * into v_existing from public.app_backups
    where id = p_id and user_id = v_user and app_id = 'todo';
  -- Same request ID after a lost response: return the original, never append twice.
  if found then
    if v_existing.backup_data is distinct from p_backup_data
       or v_existing.schema_version <> p_schema_version then
      raise exception 'Backup request ID already used with different data';
    end if;
    return jsonb_build_object('status', 'saved', 'backup', to_jsonb(v_existing));
  end if;
  select * into v_latest from public.app_backups
    where user_id = v_user and app_id = 'todo'
    order by created_at desc, id desc limit 1;
  if v_latest.id is distinct from p_expected_id then
    return jsonb_build_object('status', 'conflict', 'latest',
      case when v_latest.id is null then null else to_jsonb(v_latest) end);
  end if;
  insert into public.app_backups(id, user_id, app_id, schema_version, backup_data, created_at)
    values(p_id, v_user, 'todo', p_schema_version, p_backup_data,
      greatest(clock_timestamp(), coalesce(v_latest.created_at + interval '1 microsecond', '-infinity'::timestamptz)))
    returning * into v_saved;
  -- Keep retention in the same transaction as the successful append.
  if not public.todo_prune_backups(v_saved.id, v_user) then
    raise exception 'Todo backup retention could not be verified';
  end if;
  return jsonb_build_object('status', 'saved', 'backup', to_jsonb(v_saved));
end;
$$;

create or replace function public.todo_prune_backups(p_expected_id uuid, p_user_id uuid)
returns boolean language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_latest uuid;
begin
  if v_user is null or v_user is distinct from p_user_id then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':todo', 0));
  select id into v_latest from public.app_backups
    where user_id = v_user and app_id = 'todo'
    order by created_at desc, id desc limit 1;
  if v_latest is distinct from p_expected_id then return false; end if;
  delete from public.app_backups where user_id = v_user and app_id = 'todo'
    and id in (select id from public.app_backups
      where user_id = v_user and app_id = 'todo'
      order by created_at desc, id desc offset 30);
  return (
    select count(*) <= 30 from public.app_backups
    where user_id = v_user and app_id = 'todo'
  );
end;
$$;
revoke all on function public.todo_append_backup(uuid, uuid, integer, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.todo_prune_backups(uuid, uuid) from public, anon, authenticated;
grant execute on function public.todo_append_backup(uuid, uuid, integer, jsonb, uuid) to authenticated;
grant execute on function public.todo_prune_backups(uuid, uuid) to authenticated;

commit;
