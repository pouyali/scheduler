-- 0014_seed_dev_fixtures.sql
-- Idempotent dev-only seed. Called from the admin dashboard button.
-- Fixed emails / deterministic ids so re-running leaves counts unchanged.

-- Helper first so seed_dev_fixtures can reference it at create time as well.
create or replace function public.seed_dev_volunteer(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_status volunteer_status,
  p_categories text[],
  p_service_area text,
  p_approver uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid;
begin
  -- Deterministic id from the email so reruns are idempotent.
  v_user_id := md5('dev-vol:' || p_email)::uuid;

  -- Insert into auth.users with a random encrypted password (none of these seeded users can log in).
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    p_email,
    crypt(md5(random()::text), gen_salt('bf')),
    now(),
    '{"provider":"email"}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
  on conflict (id) do nothing;

  insert into public.volunteers (
    id, first_name, last_name, phone, email, status, categories,
    service_area, auth_provider, approved_at, approved_by
  )
  values (
    v_user_id,
    p_first_name,
    p_last_name,
    p_phone,
    p_email,
    p_status,
    p_categories,
    p_service_area,
    'admin_invite',
    case when p_status = 'active' then now() else null end,
    case when p_status = 'active' then p_approver else null end
  )
  on conflict (id) do nothing;
end;
$$;

create or replace function public.seed_dev_fixtures()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  seed_admin_id uuid;
begin
  -- Get any admin to stamp approved_by / created_by. If none, leave NULL (rare in dev).
  select id into seed_admin_id from public.admins limit 1;

  -- SENIORS (15 rows across Vancouver / Burnaby / Surrey).
  -- seniors.email is nullable and not unique, so idempotence uses a NOT EXISTS guard
  -- keyed on (first_name, last_name, phone) which is effectively unique for our fixtures.
  insert into public.seniors (first_name, last_name, phone, email, address_line1, city, province, postal_code, lat, lng, created_by)
  select * from (values
    ('Margaret', 'Chen',      '(604) 555-0101', 'senior-1@dev.test',  '1200 Robson St',   'Vancouver', 'BC', 'V6E 1B9', 49.2827::numeric, -123.1207::numeric, seed_admin_id),
    ('Harold',   'Wong',      '(604) 555-0102', 'senior-2@dev.test',  '800 Burrard St',   'Vancouver', 'BC', 'V6Z 2H5', 49.2820::numeric, -123.1230::numeric, seed_admin_id),
    ('Ethel',    'Singh',     '(604) 555-0103', 'senior-3@dev.test',  '550 W Broadway',   'Vancouver', 'BC', 'V5Z 1E9', 49.2633::numeric, -123.1266::numeric, seed_admin_id),
    ('Walter',   'Lam',       '(604) 555-0104', 'senior-4@dev.test',  '2020 Cambie St',   'Vancouver', 'BC', 'V5Y 2T9', 49.2527::numeric, -123.1153::numeric, seed_admin_id),
    ('Doris',    'Patel',     '(604) 555-0105', 'senior-5@dev.test',  '1800 W 41st Ave',  'Vancouver', 'BC', 'V6M 1Z1', 49.2339::numeric, -123.1578::numeric, seed_admin_id),
    ('Frank',    'Yamamoto',  '(604) 555-0106', 'senior-6@dev.test',  '4500 Kingsway',    'Burnaby',   'BC', 'V5H 2A9', 49.2276::numeric, -123.0024::numeric, seed_admin_id),
    ('Ruth',     'Nguyen',    '(604) 555-0107', 'senior-7@dev.test',  '6000 Canada Way',  'Burnaby',   'BC', 'V5E 3N1', 49.2232::numeric, -123.0180::numeric, seed_admin_id),
    ('Stanley',  'Brown',     '(604) 555-0108', 'senior-8@dev.test',  '3300 Willingdon',  'Burnaby',   'BC', 'V5G 3H4', 49.2480::numeric, -123.0020::numeric, seed_admin_id),
    ('Betty',    'Kumar',     '(604) 555-0109', 'senior-9@dev.test',  '4201 Hastings',    'Burnaby',   'BC', 'V5C 2J4', 49.2818::numeric, -123.0161::numeric, seed_admin_id),
    ('George',   'Morrison',  '(604) 555-0110', 'senior-10@dev.test', '10293 152 St',     'Surrey',    'BC', 'V3R 4G8', 49.1865::numeric, -122.8436::numeric, seed_admin_id),
    ('Vera',     'Taylor',    '(604) 555-0111', 'senior-11@dev.test', '15299 68 Ave',     'Surrey',    'BC', 'V3S 2B9', 49.1332::numeric, -122.7999::numeric, seed_admin_id),
    ('Henry',    'Davis',     '(604) 555-0112', 'senior-12@dev.test', '10355 University', 'Surrey',    'BC', 'V3T 5H5', 49.1869::numeric, -122.8494::numeric, seed_admin_id),
    ('Pearl',    'Johnson',   '(604) 555-0113', 'senior-13@dev.test', '5700 176 St',      'Surrey',    'BC', 'V3S 4C5', 49.1076::numeric, -122.7561::numeric, seed_admin_id),
    ('Arthur',   'Reyes',     '(604) 555-0114', 'senior-14@dev.test', '9500 King George', 'Surrey',    'BC', 'V3T 0P7', 49.1897::numeric, -122.8436::numeric, seed_admin_id),
    ('Iris',     'Olsen',     '(604) 555-0115', 'senior-15@dev.test', 'Unknown address',  'Vancouver', 'BC', 'V6B 1A1', null::numeric,    null::numeric,     seed_admin_id)
  ) as v(first_name, last_name, phone, email, address_line1, city, province, postal_code, lat, lng, created_by)
  where not exists (
    select 1 from public.seniors s
    where s.first_name = v.first_name
      and s.last_name  = v.last_name
      and s.phone      = v.phone
  );

  -- VOLUNTEERS — use the helper to create auth.users + volunteers row atomically.
  perform public.seed_dev_volunteer('vol-1@dev.test',  'Ava',    'Martinez',  '(604) 555-0201', 'active'::volunteer_status,   array['transportation','shopping'],          'Vancouver', seed_admin_id);
  perform public.seed_dev_volunteer('vol-2@dev.test',  'Ben',    'Okoro',     '(604) 555-0202', 'active'::volunteer_status,   array['companionship'],                      'Vancouver', seed_admin_id);
  perform public.seed_dev_volunteer('vol-3@dev.test',  'Cara',   'Dubois',    '(604) 555-0203', 'active'::volunteer_status,   array['household_tasks','technology_help'],  'Burnaby',   seed_admin_id);
  perform public.seed_dev_volunteer('vol-4@dev.test',  'Dmitri', 'Ivanov',    '(604) 555-0204', 'active'::volunteer_status,   array['transportation'],                     'Surrey',    seed_admin_id);
  perform public.seed_dev_volunteer('vol-5@dev.test',  'Esha',   'Khan',      '(604) 555-0205', 'active'::volunteer_status,   array['meal_delivery','shopping'],           'Vancouver', seed_admin_id);
  perform public.seed_dev_volunteer('vol-6@dev.test',  'Felix',  'Obi',       '(604) 555-0206', 'active'::volunteer_status,   array['companionship','technology_help'],    'Burnaby',   seed_admin_id);
  perform public.seed_dev_volunteer('vol-7@dev.test',  'Gia',    'Park',      '(604) 555-0207', 'pending'::volunteer_status,  array['transportation'],                     'Vancouver', null);
  perform public.seed_dev_volunteer('vol-8@dev.test',  'Hiro',   'Tanaka',    '(604) 555-0208', 'pending'::volunteer_status,  array['shopping'],                           'Surrey',    null);
  perform public.seed_dev_volunteer('vol-9@dev.test',  'Iris',   'Fernandez', '(604) 555-0209', 'pending'::volunteer_status,  array['household_tasks'],                    'Burnaby',   null);
  perform public.seed_dev_volunteer('vol-10@dev.test', 'Jax',    'Nakamura',  '(604) 555-0210', 'inactive'::volunteer_status, array['other'],                              'Vancouver', null);

  -- SERVICE REQUESTS — 5 across statuses. Idempotent by senior + description.
  insert into public.service_requests (senior_id, category, priority, requested_date, description, status, created_by)
  select s.id, 'transportation', 'normal', current_date + 2, 'Ride to medical appointment', 'open', seed_admin_id
  from public.seniors s
  where s.email = 'senior-1@dev.test'
    and not exists (
      select 1 from public.service_requests r
      where r.senior_id = s.id and r.description = 'Ride to medical appointment'
    );

  insert into public.service_requests (senior_id, category, priority, requested_date, description, status, created_by)
  select s.id, 'shopping', 'normal', current_date + 3, 'Grocery pickup', 'open', seed_admin_id
  from public.seniors s
  where s.email = 'senior-3@dev.test'
    and not exists (
      select 1 from public.service_requests r
      where r.senior_id = s.id and r.description = 'Grocery pickup'
    );

  insert into public.service_requests (senior_id, category, priority, requested_date, description, status, created_by)
  select s.id, 'companionship', 'low', current_date + 5, 'Weekly visit', 'notified', seed_admin_id
  from public.seniors s
  where s.email = 'senior-6@dev.test'
    and not exists (
      select 1 from public.service_requests r
      where r.senior_id = s.id and r.description = 'Weekly visit'
    );

  insert into public.service_requests (senior_id, category, priority, requested_date, description, status, assigned_volunteer_id, created_by)
  select s.id, 'meal_delivery', 'normal', current_date + 1, 'Meal drop-off',
         'accepted',
         (select id from public.volunteers where email = 'vol-5@dev.test' limit 1),
         seed_admin_id
  from public.seniors s
  where s.email = 'senior-10@dev.test'
    and not exists (
      select 1 from public.service_requests r
      where r.senior_id = s.id and r.description = 'Meal drop-off'
    );

  insert into public.service_requests (senior_id, category, priority, requested_date, description, status, completed_at, assigned_volunteer_id, created_by)
  select s.id, 'household_tasks', 'normal', current_date - 3, 'Helped change light bulbs',
         'completed', now() - interval '2 days',
         (select id from public.volunteers where email = 'vol-3@dev.test' limit 1),
         seed_admin_id
  from public.seniors s
  where s.email = 'senior-8@dev.test'
    and not exists (
      select 1 from public.service_requests r
      where r.senior_id = s.id and r.description = 'Helped change light bulbs'
    );
end;
$$;

revoke all on function public.seed_dev_fixtures() from public;
revoke all on function public.seed_dev_volunteer(text, text, text, text, volunteer_status, text[], text, uuid) from public;

comment on function public.seed_dev_fixtures() is 'Dev-only idempotent fixtures for volunteers, seniors, requests. Called from /api/dev/seed.';
comment on function public.seed_dev_volunteer(text, text, text, text, volunteer_status, text[], text, uuid) is 'Dev-only helper: inserts auth.users + volunteers row with a deterministic id keyed from the email.';
