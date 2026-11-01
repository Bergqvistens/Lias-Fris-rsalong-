-- Lokal testdatabas för Lias Hantverkeri (PostgreSQL 16). Skapad med pg_dump 1 nov 2026 (till och med debitering del B).
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;
--
-- PostgreSQL database dump
--

\restrict g2uQq6PlQtEFj6CUXYrsgsLBVTUF7GmmCiFtY9Bxrh9vVo38O0Zq3cPZrFadylI

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA auth;


ALTER SCHEMA auth OWNER TO postgres;

--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: postgres
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;


ALTER FUNCTION auth.uid() OWNER TO postgres;

--
-- Name: auto_uteblivna(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.auto_uteblivna() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_admin() then raise exception 'EJ_ADMIN'; end if;
  return public.auto_uteblivna_kor();
end $$;


ALTER FUNCTION public.auto_uteblivna() OWNER TO postgres;

--
-- Name: auto_uteblivna_kor(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.auto_uteblivna_kor() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r record; n integer := 0;
begin
  for r in
    select distinct on (coalesce(group_id, id)) id, coalesce(group_id, id) as k
      from public.bookings b
     where status = 'bokad' and arrived_at is null and rules_version is not null
     order by coalesce(group_id, id), starts_at
  loop
    if (select min(starts_at) from public.bookings where coalesce(group_id, id) = r.k) between now() - interval '24 hours' and now() - interval '15 minutes'
       and not exists (select 1 from public.uteblivna u where coalesce(u.group_id, u.booking_id) = r.k)
       and not exists (select 1 from public.bookings where coalesce(group_id, id) = r.k and arrived_at is not null) then
      perform public.registrera_uteblivet_kor(r.id, 'uteblev');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;


ALTER FUNCTION public.auto_uteblivna_kor() OWNER TO postgres;

--
-- Name: confirm_booking(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.confirm_booking(p_token text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tok     uuid := public.kund_token(p_token);
  v_start   timestamptz;
  v_end     timestamptz;
  v_sum     integer;
  v_conf    timestamptz;
  v_hours   integer;
  v_already boolean;
begin
  perform public.kund_kontroll(v_tok);
  select min(starts_at), max(ends_at), sum(price), max(confirmed_at) into v_start, v_end, v_sum, v_conf
    from public.bookings where confirm_token = v_tok and status = 'bokad';
  if v_end <= now() then raise exception 'BOKNING_PASSERAD'; end if;
  v_hours := public.kund_timmar(v_tok);
  v_already := v_conf is not null;
  if not v_already then
    v_conf := now();
    update public.bookings set confirmed_at = v_conf where confirm_token = v_tok and status = 'bokad';
  end if;
  return json_build_object(
    'starts_at', v_start, 'ends_at', v_end, 'already', v_already, 'confirmed_at', v_conf,
    'customer_name', (select customer_name from public.bookings where confirm_token = v_tok and status = 'bokad' order by starts_at limit 1),
    'items', (select json_agg(json_build_object('person_name', person_name, 'service_ids', service_ids, 'service_names', service_names,
                                                'price', price, 'starts_at', starts_at, 'ends_at', ends_at) order by starts_at)
                from public.bookings where confirm_token = v_tok and status = 'bokad'),
    'price', v_sum, 'cancel_hours', v_hours, 'deadline', v_start - make_interval(hours => v_hours),
    'late', now() >= v_start - make_interval(hours => v_hours), 'can_change', v_start > now());
end $$;


ALTER FUNCTION public.confirm_booking(p_token text) OWNER TO postgres;

--
-- Name: create_booking(jsonb, timestamp with time zone, text, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_booking(p_people jsonb, p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text, p_rules text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_n         integer;
  v_person    jsonb;
  v_cat       text;
  v_pname     text;
  v_ids       text[];
  v_count     integer;
  v_cuts      integer;
  v_dur       integer;
  v_price     integer;
  v_names     text;
  v_cursor    timestamptz;
  v_end       timestamptz;
  v_total     integer := 0;
  v_total_dur integer := 0;
  v_group     uuid := gen_random_uuid();
  v_token     uuid := gen_random_uuid();   -- kundens länk i sms:et (en för hela bokningen)
  v_rows      jsonb := '[]'::jsonb;
  v_local     timestamp;
  v_local_end timestamp;
  v_dow       integer;
  v_open      time;
  v_close     time;
  v_id        uuid;
  v_all_names text := '';
  v_day_open  timestamptz;
  v_day_close timestamptz;
  v_prev      timestamptz;
  v_next      timestamptz;
begin
  -- Kontaktuppgifter
  p_name  := btrim(coalesce(p_name, ''));
  p_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  p_email := btrim(coalesce(p_email, ''));
  if length(p_name) < 2 or length(p_name) > 100 then raise exception 'OGILTIGT_NAMN'; end if;
  if p_phone !~ '^0[0-9]{9}$' then raise exception 'OGILTIGT_TELEFON'; end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then raise exception 'OGILTIG_EPOST'; end if;
  -- Kunden måste ha godkänt gällande avbokningsregler (uteblivet besök kan debiteras), 1 nov 2026
  -- Gällande version: '2026-11-01-v2' (Tommys formulering, regeln först). Äldre bokningar behåller sin version.
  if p_rules is distinct from '2026-11-01-v2' then raise exception 'REGLER_EJ_GODKANDA'; end if;

  -- Personer
  if p_people is null or jsonb_typeof(p_people) <> 'array' then raise exception 'OGILTIGA_TJANSTER'; end if;
  v_n := jsonb_array_length(p_people);
  if v_n < 1 or v_n > 4 then raise exception 'OGILTIGT_ANTAL_PERSONER'; end if;

  -- Tid: framåt i tiden, inom 60 dagar, på kvarten
  if p_starts_at is null or p_starts_at < now() + interval '30 minutes' or p_starts_at > now() + interval '60 days' then
    raise exception 'OGILTIG_TID';
  end if;
  if extract(second from p_starts_at) <> 0 or extract(minute from p_starts_at)::int % 15 <> 0 then
    raise exception 'OGILTIG_TID';
  end if;

  -- Första genomgången: kontrollera varje person och räkna ut kedjan
  v_cursor := p_starts_at;
  for v_person in select value from jsonb_array_elements(p_people) loop
    v_cat   := v_person->>'category';
    v_pname := btrim(coalesce(v_person->>'name', ''));
    if v_cat is null or not exists (select 1 from public.services where category = v_cat) or jsonb_typeof(v_person->'service_ids') <> 'array' then
      raise exception 'OGILTIGA_TJANSTER';
    end if;
    select array_agg(distinct x) into v_ids from jsonb_array_elements_text(v_person->'service_ids') x;
    if v_ids is null or cardinality(v_ids) = 0 or cardinality(v_ids) > 5 then raise exception 'OGILTIGA_TJANSTER'; end if;
    select count(*), count(*) filter (where kind = 'klipp'), sum(duration), sum(price)
      into v_count, v_cuts, v_dur, v_price
      from public.services where id = any(v_ids) and category = v_cat;
    if v_count <> cardinality(v_ids) then raise exception 'OGILTIGA_TJANSTER'; end if;
    if v_cuts <> 1 then raise exception 'EN_KLIPPNING_PER_PERSON'; end if;
    if v_n > 1 and (length(v_pname) < 2 or length(v_pname) > 50) then raise exception 'OGILTIGT_PERSONNAMN'; end if;
    v_cursor := v_cursor + make_interval(mins => v_dur);
  end loop;
  v_end := v_cursor;

  -- Öppettider (svensk tid) för hela kedjan.
  v_local     := p_starts_at at time zone 'Europe/Stockholm';
  v_local_end := v_end       at time zone 'Europe/Stockholm';
  v_dow := extract(isodow from v_local);   -- 1 = måndag … 7 = söndag
  -- Tisdag–fredag 9–17. Måndag, lördag (öppet vid förfrågan) och söndag: ingen onlinebokning.
  v_open  := case when v_dow between 2 and 5 then time '09:00' else null end;
  v_close := case when v_dow between 2 and 5 then time '17:00' else null end;
  if v_open is null or v_local::time < v_open or v_local_end::date <> v_local::date or v_local_end::time > v_close then
    raise exception 'UTANFOR_OPPETTID';
  end if;

  -- Bokningar sparas en i taget (låset släpps när anropet är klart). Då kan två samtidiga
  -- bokningar aldrig låsa varandra; den som kommer sist får TIDEN_UPPTAGEN.
  perform pg_advisory_xact_lock(hashtext('lias_bokning'));

  -- Inga korta luckor i Lias schema (Lia 31 okt 2026): luckan före och efter måste vara 0 minuter
  -- (direkt i följd) eller minst 45 minuter. Tid före nu + 30 min räknas inte som lucka (kan ändå inte bokas).
  v_day_open  := (v_local::date + v_open)  at time zone 'Europe/Stockholm';
  v_day_close := (v_local::date + v_close) at time zone 'Europe/Stockholm';
  select greatest(v_day_open, coalesce(max(ends_at), v_day_open)) into v_prev
    from public.bookings where status = 'bokad' and ends_at <= p_starts_at and ends_at > v_day_open;
  select least(v_day_close, coalesce(min(starts_at), v_day_close)) into v_next
    from public.bookings where status = 'bokad' and starts_at >= v_end and starts_at < v_day_close;
  if v_prev >= now() + interval '30 minutes' and p_starts_at > v_prev and p_starts_at - v_prev < interval '45 minutes' then
    raise exception 'KORT_LUCKA';
  end if;
  if v_next > v_end and v_next - v_end < interval '45 minutes' then
    raise exception 'KORT_LUCKA';
  end if;

  -- Andra genomgången: spara en rad per person. Krockspärren stoppar dubbelbokning;
  -- ett fel avbryter hela anropet, så inga halva grupper sparas.
  v_cursor := p_starts_at;
  for v_person in select value from jsonb_array_elements(p_people) loop
    v_cat   := v_person->>'category';
    v_pname := nullif(btrim(coalesce(v_person->>'name', '')), '');
    if v_n = 1 then v_pname := null; end if;
    select array_agg(distinct x) into v_ids from jsonb_array_elements_text(v_person->'service_ids') x;
    select sum(duration), sum(price), string_agg(name, ', ' order by (kind <> 'klipp'), name)
      into v_dur, v_price, v_names
      from public.services where id = any(v_ids) and category = v_cat;
    begin
      insert into public.bookings
        (service_ids, service_names, price, starts_at, ends_at, customer_name, customer_phone, customer_email, person_name, group_id, rules_version, confirm_token)
      values
        (v_ids, v_names, v_price, v_cursor, v_cursor + make_interval(mins => v_dur), p_name, p_phone, p_email, v_pname, v_group, p_rules, v_token)
      returning id into v_id;
    exception when exclusion_violation then
      raise exception 'TIDEN_UPPTAGEN';
    end;
    v_rows := v_rows || jsonb_build_object('id', v_id, 'person_name', v_pname, 'service_names', v_names, 'price', v_price,
      'starts_at', v_cursor, 'ends_at', v_cursor + make_interval(mins => v_dur));
    v_all_names := v_all_names || case when v_all_names = '' then '' else '; ' end || coalesce(v_pname || ': ', '') || v_names;
    v_total := v_total + v_price;
    v_total_dur := v_total_dur + v_dur;
    v_cursor := v_cursor + make_interval(mins => v_dur);
  end loop;

  return json_build_object(
    'id', (v_rows->0->>'id')::uuid, 'group_id', v_group, 'starts_at', p_starts_at, 'ends_at', v_end,
    'service_names', v_all_names, 'price', v_total, 'duration', v_total_dur, 'items', v_rows);
end;
$_$;


ALTER FUNCTION public.create_booking(p_people jsonb, p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text, p_rules text) OWNER TO postgres;

--
-- Name: get_busy(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_busy(p_from timestamp with time zone, p_to timestamp with time zone) RETURNS TABLE(starts_at timestamp with time zone, ends_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select b.starts_at, b.ends_at
  from public.bookings b
  where b.status = 'bokad'
    and b.starts_at < p_to
    and b.ends_at   > p_from
    and p_to - p_from <= interval '62 days'
  order by b.starts_at;
$$;


ALTER FUNCTION public.get_busy(p_from timestamp with time zone, p_to timestamp with time zone) OWNER TO postgres;

--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;


ALTER FUNCTION public.is_admin() OWNER TO postgres;

--
-- Name: kund_avboka(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.kund_avboka(p_token text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tok   uuid := public.kund_token(p_token);
  v_first uuid;
  v_start timestamptz;
  v_hours integer;
  v_late  boolean;
  v_ute   json;
begin
  perform pg_advisory_xact_lock(hashtext('lias_bokning'));
  perform public.kund_kontroll(v_tok);
  perform 1 from public.bookings where confirm_token = v_tok and status = 'bokad' for update;
  select id, starts_at into v_first, v_start from public.bookings
   where confirm_token = v_tok and status = 'bokad' order by starts_at limit 1;
  if v_start <= now() then raise exception 'TIDEN_HAR_BORJAT'; end if;
  v_hours := public.kund_timmar(v_tok);
  v_late := now() >= v_start - make_interval(hours => v_hours);
  update public.bookings set status = 'avbokad', cancelled_by = 'kund' where confirm_token = v_tok and status = 'bokad';
  if v_late then v_ute := public.registrera_uteblivet_kor(v_first, 'sen_avbokning'); end if;
  return json_build_object('starts_at', v_start, 'late', v_late, 'cancel_hours', v_hours);
end $$;


ALTER FUNCTION public.kund_avboka(p_token text) OWNER TO postgres;

--
-- Name: kund_kontroll(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.kund_kontroll(p_token uuid) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (select 1 from public.bookings where confirm_token = p_token) then raise exception 'OGILTIG_LANK'; end if;
  if not exists (select 1 from public.bookings where confirm_token = p_token and status = 'bokad') then
    if exists (select 1 from public.bookings where confirm_token = p_token and ombokad_till is not null) then raise exception 'BOKNING_OMBOKAD'; end if;
    raise exception 'BOKNING_AVBOKAD';
  end if;
end $$;


ALTER FUNCTION public.kund_kontroll(p_token uuid) OWNER TO postgres;

--
-- Name: kund_omboka(text, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.kund_omboka(p_token text, p_starts_at timestamp with time zone, p_rules text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tok    uuid := public.kund_token(p_token);
  v_first  public.bookings%rowtype;
  v_start  timestamptz;
  v_hours  integer;
  v_late   boolean;
  v_people jsonb;
  v_new    json;
  v_ntok   uuid;
  v_ute    json;
begin
  perform pg_advisory_xact_lock(hashtext('lias_bokning'));
  perform public.kund_kontroll(v_tok);
  perform 1 from public.bookings where confirm_token = v_tok and status = 'bokad' for update;
  select * into v_first from public.bookings where confirm_token = v_tok and status = 'bokad' order by starts_at limit 1;
  v_start := v_first.starts_at;
  if v_start <= now() then raise exception 'TIDEN_HAR_BORJAT'; end if;
  if p_starts_at is not null and p_starts_at = v_start then raise exception 'SAMMA_TID'; end if;
  v_hours := public.kund_timmar(v_tok);
  v_late := now() >= v_start - make_interval(hours => v_hours);
  select jsonb_agg(jsonb_build_object('category', (select s.category from public.services s where s.id = b.service_ids[1]),
                                      'service_ids', to_jsonb(b.service_ids), 'name', coalesce(b.person_name, ''))
                   order by b.starts_at)
    into v_people from public.bookings b where b.confirm_token = v_tok and b.status = 'bokad';
  update public.bookings set status = 'avbokad', cancelled_by = 'kund', ombokad_till = p_starts_at
   where confirm_token = v_tok and status = 'bokad';
  -- Samma kontroller som en vanlig bokning (öppettider, krockar, luckor, regler). Fel = inget sparas.
  v_new := public.create_booking(v_people, p_starts_at, v_first.customer_name, v_first.customer_phone, v_first.customer_email, p_rules);
  update public.bookings set confirmed_at = now() where group_id = (v_new->>'group_id')::uuid;   -- kunden valde tiden själv
  select confirm_token into v_ntok from public.bookings where group_id = (v_new->>'group_id')::uuid limit 1;
  if v_late then v_ute := public.registrera_uteblivet_kor(v_first.id, 'sen_ombokning'); end if;
  return (v_new::jsonb || jsonb_build_object('late', v_late, 'old_starts_at', v_start, 'confirm_token', v_ntok, 'cancel_hours', v_hours))::json;
end $$;


ALTER FUNCTION public.kund_omboka(p_token text, p_starts_at timestamp with time zone, p_rules text) OWNER TO postgres;

--
-- Name: kund_timmar(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.kund_timmar(p_token uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case when exists (select 1 from public.bookings x join public.services s on s.id = any(x.service_ids)
                            where x.confirm_token = p_token and x.status = 'bokad'
                              and s.category in ('Färgbehandling', 'Permanent'))
              then 48 else 24 end;
$$;


ALTER FUNCTION public.kund_timmar(p_token uuid) OWNER TO postgres;

--
-- Name: kund_token(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.kund_token(p_token text) RETURNS uuid
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
begin
  if p_token is null or p_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'OGILTIG_LANK';
  end if;
  return p_token::uuid;
end $_$;


ALTER FUNCTION public.kund_token(p_token text) OWNER TO postgres;

--
-- Name: markera_kommit(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.markera_kommit(p_booking uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare b public.bookings%rowtype;
begin
  if not public.is_admin() then raise exception 'EJ_ADMIN'; end if;
  select * into b from public.bookings where id = p_booking;
  if not found or b.status <> 'bokad' then raise exception 'OGILTIG_BOKNING'; end if;
  update public.bookings set arrived_at = coalesce(arrived_at, now())
   where (b.group_id is not null and group_id = b.group_id) or id = b.id;
  update public.uteblivna set status = 'havd', andrad_at = now()
   where coalesce(group_id, booking_id) = coalesce(b.group_id, b.id) and kind = 'uteblev' and status in ('ingen_avgift', 'obetald');
  return json_build_object('arrived_at', (select arrived_at from public.bookings where id = p_booking));
end $$;


ALTER FUNCTION public.markera_kommit(p_booking uuid) OWNER TO postgres;

--
-- Name: registrera_uteblivet(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.registrera_uteblivet(p_booking uuid, p_kind text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_admin() then raise exception 'EJ_ADMIN'; end if;
  return public.registrera_uteblivet_kor(p_booking, p_kind);
end $$;


ALTER FUNCTION public.registrera_uteblivet(p_booking uuid, p_kind text) OWNER TO postgres;

--
-- Name: registrera_uteblivet_kor(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.registrera_uteblivet_kor(p_booking uuid, p_kind text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  b       public.bookings%rowtype;
  v_hours integer;
  v_n     integer;
  v_sum   integer;
  v_start timestamptz;
  v_row   public.uteblivna%rowtype;
begin
  if p_kind not in ('uteblev', 'sen_avbokning', 'sen_ombokning', 'sen_ankomst') then raise exception 'OGILTIG_TYP'; end if;
  select * into b from public.bookings where id = p_booking;
  if not found then raise exception 'OGILTIG_BOKNING'; end if;
  -- Belopp och starttid räknas på de rader som gäller: aktiva rader (uteblev/sen ankomst), eller raderna som
  -- avbokades i samma ögonblick (sen avbokning/ombokning). En person som Lia avbokat tidigare räknas inte med (rättat 1 nov 2026).
  select min(starts_at), sum(price) into v_start, v_sum from public.bookings
   where ((b.group_id is not null and group_id = b.group_id) or id = b.id)
     and (case when p_kind in ('uteblev', 'sen_ankomst') then status = 'bokad'
               else status = 'avbokad' and cancelled_at = b.cancelled_at end);
  if p_kind = 'uteblev' then
    if b.status <> 'bokad' then raise exception 'OGILTIG_BOKNING'; end if;
    if v_start > now() then raise exception 'TIDEN_HAR_INTE_BORJAT'; end if;
    if b.arrived_at is not null then raise exception 'KUNDEN_HAR_KOMMIT'; end if;
  elsif p_kind = 'sen_ankomst' then
    -- Lia bedömer själv; tiden måste ha börjat för minst 5 minuter sedan (Lia 1 nov 2026)
    if b.status <> 'bokad' then raise exception 'OGILTIG_BOKNING'; end if;
    if v_start > now() - interval '5 minutes' then raise exception 'INTE_SEN_ANKOMST'; end if;
  else
    if b.status <> 'avbokad' or b.cancelled_at is null then raise exception 'OGILTIG_BOKNING'; end if;
    -- 48 timmar för färg och permanent, annars 24 (samma som appens avbokningsregler)
    select case when exists (select 1 from public.bookings x join public.services s on s.id = any(x.service_ids)
                              where ((b.group_id is not null and x.group_id = b.group_id) or x.id = b.id)
                                and x.status = 'avbokad' and x.cancelled_at = b.cancelled_at
                                and s.category in ('Färgbehandling', 'Permanent'))
                then 48 else 24 end into v_hours;
    if b.cancelled_at < v_start - make_interval(hours => v_hours) then raise exception 'INTE_SEN_AVBOKNING'; end if;
  end if;
  if exists (select 1 from public.uteblivna where coalesce(group_id, booking_id) = coalesce(b.group_id, b.id)) then
    raise exception 'REDAN_REGISTRERAD';
  end if;
  v_n := public.uteblivet_nasta_nummer(b.customer_phone);
  insert into public.uteblivna (booking_id, group_id, customer_name, customer_phone, kind, nummer, belopp, status)
  values (b.id, b.group_id, b.customer_name, b.customer_phone, p_kind, v_n,
          case when v_n = 1 then 0 else v_sum end, case when v_n = 1 then 'ingen_avgift' else 'obetald' end)
  returning * into v_row;
  return row_to_json(v_row);
end $$;


ALTER FUNCTION public.registrera_uteblivet_kor(p_booking uuid, p_kind text) OWNER TO postgres;

--
-- Name: rensa_gamla_avbokningar(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rensa_gamla_avbokningar() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_admin() then raise exception 'EJ_ADMIN'; end if;
  return public.rensa_gamla_avbokningar_kor();
end $$;


ALTER FUNCTION public.rensa_gamla_avbokningar() OWNER TO postgres;

--
-- Name: rensa_gamla_avbokningar_kor(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rensa_gamla_avbokningar_kor() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare n integer;
begin
  delete from public.uteblivna where created_at < now() - interval '12 months';
  delete from public.bookings
   where status = 'avbokad'
     and coalesce(cancelled_at, starts_at) < now() - interval '12 months';
  get diagnostics n = row_count;
  return n;
end $$;


ALTER FUNCTION public.rensa_gamla_avbokningar_kor() OWNER TO postgres;

--
-- Name: satt_avbokad_tid(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.satt_avbokad_tid() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if old.status = 'avbokad' then
    -- redan avbokad: tid och meddelande låses (bevis om en kund ifrågasätter)
    new.cancelled_at := old.cancelled_at;
    new.cancel_note  := old.cancel_note;
    new.cancelled_by := old.cancelled_by;
    new.ombokad_till := old.ombokad_till;
  elsif new.status = 'avbokad' then
    new.cancelled_at := now();
    new.cancelled_by := coalesce(new.cancelled_by, 'lia');   -- adminläget sätter inget = Lia
  else
    new.cancelled_at := null;
    new.cancelled_by := null;
    new.ombokad_till := null;
  end if;
  return new;
end $$;


ALTER FUNCTION public.satt_avbokad_tid() OWNER TO postgres;

--
-- Name: uteblivet_andra(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.uteblivet_andra(p_id uuid, p_status text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_row public.uteblivna%rowtype;
begin
  if not public.is_admin() then raise exception 'EJ_ADMIN'; end if;
  if p_status not in ('betald', 'havd') then raise exception 'OGILTIG_STATUS'; end if;
  update public.uteblivna set status = p_status, andrad_at = now()
   where id = p_id and status = case when p_status = 'betald' then 'obetald' else status end
     and status in ('ingen_avgift', 'obetald')
  returning * into v_row;
  if not found then raise exception 'OGILTIG_STATUS'; end if;
  return row_to_json(v_row);
end $$;


ALTER FUNCTION public.uteblivet_andra(p_id uuid, p_status text) OWNER TO postgres;

--
-- Name: uteblivet_forhand(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.uteblivet_forhand(p_phone text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_admin() then raise exception 'EJ_ADMIN'; end if;
  return public.uteblivet_nasta_nummer(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'));
end $$;


ALTER FUNCTION public.uteblivet_forhand(p_phone text) OWNER TO postgres;

--
-- Name: uteblivet_nasta_nummer(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.uteblivet_nasta_nummer(p_phone text) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select 1 + count(*)::integer from public.uteblivna u
   where u.customer_phone = p_phone
     and u.status in ('ingen_avgift', 'obetald')
     and u.created_at > now() - interval '12 months'
     and u.created_at > coalesce((select max(b.andrad_at) from public.uteblivna b
                                   where b.customer_phone = p_phone and b.status = 'betald'), '-infinity'::timestamptz);
$$;


ALTER FUNCTION public.uteblivet_nasta_nummer(p_phone text) OWNER TO postgres;

--
-- Name: uteblivet_skicka(uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.uteblivet_skicka(p_id uuid, p_orsak text, p_utan_sms boolean DEFAULT false) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_row public.uteblivna%rowtype;
begin
  if not public.is_admin() then raise exception 'EJ_ADMIN'; end if;
  if p_orsak not in ('sena ankomst', 'uteblivna bokning', 'sena avbokning', 'sena ombokning') then raise exception 'OGILTIG_ORSAK'; end if;
  select * into v_row from public.uteblivna where id = p_id;
  if not found or v_row.status not in ('ingen_avgift', 'obetald') then raise exception 'OGILTIG_STATUS'; end if;
  if v_row.skickat_at is not null then raise exception 'REDAN_SKICKAT'; end if;
  if p_utan_sms and v_row.status <> 'ingen_avgift' then raise exception 'OGILTIG_STATUS'; end if;
  update public.uteblivna
     set orsak = p_orsak, skickat_at = now(),
         forfaller = case when status = 'obetald' then (now() at time zone 'Europe/Stockholm')::date + 7 else null end
   where id = p_id
  returning * into v_row;
  return row_to_json(v_row);
end $$;


ALTER FUNCTION public.uteblivet_skicka(p_id uuid, p_orsak text, p_utan_sms boolean) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: users; Type: TABLE; Schema: auth; Owner: postgres
--

CREATE TABLE auth.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text
);


ALTER TABLE auth.users OWNER TO postgres;

--
-- Name: admins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admins (
    user_id uuid NOT NULL
);


ALTER TABLE public.admins OWNER TO postgres;

--
-- Name: bookings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    service_ids text[] NOT NULL,
    service_names text NOT NULL,
    price integer NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    customer_email text NOT NULL,
    status text DEFAULT 'bokad'::text NOT NULL,
    person_name text,
    group_id uuid,
    cancel_note text,
    cancelled_at timestamp with time zone,
    rules_version text,
    arrived_at timestamp with time zone,
    confirm_token uuid,
    confirmed_at timestamp with time zone,
    cancelled_by text,
    ombokad_till timestamp with time zone,
    CONSTRAINT bookings_status_check CHECK ((status = ANY (ARRAY['bokad'::text, 'avbokad'::text]))),
    CONSTRAINT cancel_note_langd CHECK (((cancel_note IS NULL) OR (char_length(cancel_note) <= 160))),
    CONSTRAINT cancelled_by_varde CHECK (((cancelled_by IS NULL) OR (cancelled_by = ANY (ARRAY['lia'::text, 'kund'::text])))),
    CONSTRAINT tid_i_ordning CHECK ((ends_at > starts_at))
);


ALTER TABLE public.bookings OWNER TO postgres;

--
-- Name: services; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.services (
    id text NOT NULL,
    name text NOT NULL,
    duration integer NOT NULL,
    price integer NOT NULL,
    category text,
    kind text,
    CONSTRAINT services_duration_check CHECK ((duration > 0)),
    CONSTRAINT services_price_check CHECK ((price >= 0))
);


ALTER TABLE public.services OWNER TO postgres;

--
-- Name: uteblivna; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.uteblivna (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    booking_id uuid NOT NULL,
    group_id uuid,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    kind text NOT NULL,
    nummer integer NOT NULL,
    belopp integer NOT NULL,
    status text NOT NULL,
    andrad_at timestamp with time zone,
    orsak text,
    skickat_at timestamp with time zone,
    forfaller date,
    CONSTRAINT uteblivna_belopp_check CHECK ((belopp >= 0)),
    CONSTRAINT uteblivna_kind_check CHECK ((kind = ANY (ARRAY['uteblev'::text, 'sen_avbokning'::text, 'sen_ombokning'::text, 'sen_ankomst'::text]))),
    CONSTRAINT uteblivna_nummer_check CHECK ((nummer >= 1)),
    CONSTRAINT uteblivna_status_check CHECK ((status = ANY (ARRAY['ingen_avgift'::text, 'obetald'::text, 'betald'::text, 'havd'::text])))
);


ALTER TABLE public.uteblivna OWNER TO postgres;

--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: postgres
--

COPY auth.users (id, email) FROM stdin;
26601db5-1fa9-4710-a669-57c468add325	lia@test.se
fdc12f7b-656c-4eb9-8137-a99b03136e81	annan@test.se
\.


--
-- Data for Name: admins; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.admins (user_id) FROM stdin;
26601db5-1fa9-4710-a669-57c468add325
\.


--
-- Data for Name: bookings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bookings (id, created_at, service_ids, service_names, price, starts_at, ends_at, customer_name, customer_phone, customer_email, status, person_name, group_id, cancel_note, cancelled_at, rules_version, arrived_at, confirm_token, confirmed_at, cancelled_by, ombokad_till) FROM stdin;
7a3618d4-0f1f-4933-8342-82002a358064	2026-11-01 13:26:40.390728+01	{harbotten}	Hårbottenmassage	750	2026-11-05 10:00:00+01	2026-11-05 10:45:00+01	Ulf U	0705555555	ulf@test.se	bokad	\N	eda93695-3134-434b-bc03-a0b4f861f77e	\N	\N	2026-11-01-v2	\N	716af777-a9a9-4253-96ad-8a4b021ea774	\N	\N	\N
0bba9425-8065-44f3-956c-b4de4cff7e5b	2026-11-01 13:26:38.881059+01	{klipp-30}	Klippning/Herrklippning 30 min	500	2026-11-06 16:30:00+01	2026-11-06 17:00:00+01	Cia C	0702222222	cia@test.se	bokad	\N	f153d53f-a057-4ead-94b8-cdc571ec5866	\N	\N	2026-11-01-v2	\N	b0ba6664-8db8-4d1e-be54-a029cce7f1b0	\N	\N	\N
987d8148-6db2-4c7c-8437-c7ec41d90b56	2026-11-01 13:26:40.106609+01	{klipp-30}	Klippning/Herrklippning 30 min	500	2026-11-04 12:00:00+01	2026-11-04 12:30:00+01	Eva Ek	0704444444	eva@test.se	bokad	Kalle	092ea60c-7d06-4b6f-849b-39de91d582fc	\N	\N	2026-11-01-v2	\N	476d2625-5ec1-4b7b-a2c5-aa40ffb79bcb	\N	\N	\N
3656bfab-f817-4380-b3d0-d16bd1539165	2026-11-01 13:26:40.106609+01	{bryn}	Färg och form av bryn.	200	2026-11-04 12:30:00+01	2026-11-04 13:00:00+01	Eva Ek	0704444444	eva@test.se	bokad	Anna	092ea60c-7d06-4b6f-849b-39de91d582fc	\N	\N	2026-11-01-v2	\N	476d2625-5ec1-4b7b-a2c5-aa40ffb79bcb	\N	\N	\N
c04e4afa-0c96-4de9-8c8f-4ef76306f1db	2026-11-01 13:26:40.106609+01	{tvatt-fon}	Tvätt & fön	400	2026-11-04 13:00:00+01	2026-11-04 13:30:00+01	Eva Ek	0704444444	eva@test.se	bokad	Lisa	092ea60c-7d06-4b6f-849b-39de91d582fc	\N	\N	2026-11-01-v2	\N	476d2625-5ec1-4b7b-a2c5-aa40ffb79bcb	\N	\N	\N
\.


--
-- Data for Name: services; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.services (id, name, duration, price, category, kind) FROM stdin;
klipp-45	Klippning 45 min.	45	600	Klippning	klipp
klipp-lyx	Klippning lyx	60	850	Klippning	klipp
klipp-30	Klippning/Herrklippning 30 min	30	500	Klippning	klipp
putsning	Putsning, kort hår med maskinklippn. sidor & nacke.	15	250	Klippning	klipp
farg-botten	Bottenfärg/utväxt	90	1000	Färgbehandling	klipp
farg-150	Färgbehandling 2.5 timmar Klippning ingår.	150	2000	Färgbehandling	klipp
farg-180	Färgbehandling 3 timmar, klippning ingår.	180	2500	Färgbehandling	klipp
klipp-farg-kort	Klipp & färg, kort hår. Som längst till nyckelbenen.	135	1350	Färgbehandling	klipp
nyansering	Nyansering	60	1100	Färgbehandling	klipp
perm-kort	Permanent inkl. klippning kort hår.	120	1650	Permanent	klipp
perm-mellan	Permanent inkl. klippning mellanlångt hår.	150	1900	Permanent	klipp
perm-lang	Permanent inkl. klippning långt hår.	180	3000	Permanent	klipp
tvatt-fon	Tvätt & fön	30	400	Styling, tvätt & föning	klipp
tvatt-fon-60	Tvätt & fön/ styling 1 timma	60	800	Styling, tvätt & föning	klipp
harbotten	Hårbottenmassage	45	750	Hårbottenmassage	klipp
bryn	Färg och form av bryn.	30	200	Frans och/eller brynfärg	klipp
frans-bryn	Ögonfransfärgning & brynfärg + formning	30	250	Frans och/eller brynfärg	klipp
\.


--
-- Data for Name: uteblivna; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.uteblivna (id, created_at, booking_id, group_id, customer_name, customer_phone, kind, nummer, belopp, status, andrad_at, orsak, skickat_at, forfaller) FROM stdin;
\.


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (user_id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: bookings ingen_krock; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT ingen_krock EXCLUDE USING gist (tstzrange(starts_at, ends_at, '[)'::text) WITH &&) WHERE ((status = 'bokad'::text));


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: uteblivna uteblivna_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.uteblivna
    ADD CONSTRAINT uteblivna_pkey PRIMARY KEY (id);


--
-- Name: bookings_confirm_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX bookings_confirm_token ON public.bookings USING btree (confirm_token);


--
-- Name: uteblivna_en_per_bokning; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uteblivna_en_per_bokning ON public.uteblivna USING btree (COALESCE(group_id, booking_id));


--
-- Name: uteblivna_telefon; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX uteblivna_telefon ON public.uteblivna USING btree (customer_phone, created_at);


--
-- Name: bookings avbokad_tid; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER avbokad_tid BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.satt_avbokad_tid();


--
-- Name: uteblivna uteblivna_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.uteblivna
    ADD CONSTRAINT uteblivna_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: bookings admin_avbokar; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admin_avbokar ON public.bookings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: bookings admin_laser_bokningar; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admin_laser_bokningar ON public.bookings FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: uteblivna admin_laser_uteblivna; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admin_laser_uteblivna ON public.uteblivna FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: admins; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

--
-- Name: services alla_laser_tjanster; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY alla_laser_tjanster ON public.services FOR SELECT USING (true);


--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

--
-- Name: uteblivna; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.uteblivna ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: postgres
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


ALTER PUBLICATION supabase_realtime OWNER TO postgres;

--
-- Name: supabase_realtime bookings; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.bookings;


--
-- Name: SCHEMA auth; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA auth TO anon;
GRANT USAGE ON SCHEMA auth TO authenticated;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;


--
-- Name: FUNCTION uid(); Type: ACL; Schema: auth; Owner: postgres
--

GRANT ALL ON FUNCTION auth.uid() TO anon;
GRANT ALL ON FUNCTION auth.uid() TO authenticated;


--
-- Name: FUNCTION auto_uteblivna(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.auto_uteblivna() FROM PUBLIC;
GRANT ALL ON FUNCTION public.auto_uteblivna() TO authenticated;


--
-- Name: FUNCTION auto_uteblivna_kor(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.auto_uteblivna_kor() FROM PUBLIC;


--
-- Name: FUNCTION confirm_booking(p_token text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.confirm_booking(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_booking(p_token text) TO anon;
GRANT ALL ON FUNCTION public.confirm_booking(p_token text) TO authenticated;


--
-- Name: FUNCTION create_booking(p_people jsonb, p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text, p_rules text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.create_booking(p_people jsonb, p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text, p_rules text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_booking(p_people jsonb, p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text, p_rules text) TO anon;
GRANT ALL ON FUNCTION public.create_booking(p_people jsonb, p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text, p_rules text) TO authenticated;


--
-- Name: FUNCTION get_busy(p_from timestamp with time zone, p_to timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_busy(p_from timestamp with time zone, p_to timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_busy(p_from timestamp with time zone, p_to timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.get_busy(p_from timestamp with time zone, p_to timestamp with time zone) TO authenticated;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;


--
-- Name: FUNCTION kund_avboka(p_token text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.kund_avboka(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.kund_avboka(p_token text) TO anon;
GRANT ALL ON FUNCTION public.kund_avboka(p_token text) TO authenticated;


--
-- Name: FUNCTION kund_kontroll(p_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.kund_kontroll(p_token uuid) FROM PUBLIC;


--
-- Name: FUNCTION kund_omboka(p_token text, p_starts_at timestamp with time zone, p_rules text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.kund_omboka(p_token text, p_starts_at timestamp with time zone, p_rules text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.kund_omboka(p_token text, p_starts_at timestamp with time zone, p_rules text) TO anon;
GRANT ALL ON FUNCTION public.kund_omboka(p_token text, p_starts_at timestamp with time zone, p_rules text) TO authenticated;


--
-- Name: FUNCTION kund_timmar(p_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.kund_timmar(p_token uuid) FROM PUBLIC;


--
-- Name: FUNCTION kund_token(p_token text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.kund_token(p_token text) FROM PUBLIC;


--
-- Name: FUNCTION markera_kommit(p_booking uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.markera_kommit(p_booking uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.markera_kommit(p_booking uuid) TO authenticated;


--
-- Name: FUNCTION registrera_uteblivet(p_booking uuid, p_kind text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.registrera_uteblivet(p_booking uuid, p_kind text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.registrera_uteblivet(p_booking uuid, p_kind text) TO authenticated;


--
-- Name: FUNCTION registrera_uteblivet_kor(p_booking uuid, p_kind text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.registrera_uteblivet_kor(p_booking uuid, p_kind text) FROM PUBLIC;


--
-- Name: FUNCTION rensa_gamla_avbokningar(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.rensa_gamla_avbokningar() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rensa_gamla_avbokningar() TO authenticated;


--
-- Name: FUNCTION rensa_gamla_avbokningar_kor(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.rensa_gamla_avbokningar_kor() FROM PUBLIC;


--
-- Name: FUNCTION uteblivet_andra(p_id uuid, p_status text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.uteblivet_andra(p_id uuid, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.uteblivet_andra(p_id uuid, p_status text) TO authenticated;


--
-- Name: FUNCTION uteblivet_forhand(p_phone text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.uteblivet_forhand(p_phone text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.uteblivet_forhand(p_phone text) TO authenticated;


--
-- Name: FUNCTION uteblivet_nasta_nummer(p_phone text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.uteblivet_nasta_nummer(p_phone text) FROM PUBLIC;


--
-- Name: FUNCTION uteblivet_skicka(p_id uuid, p_orsak text, p_utan_sms boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.uteblivet_skicka(p_id uuid, p_orsak text, p_utan_sms boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.uteblivet_skicka(p_id uuid, p_orsak text, p_utan_sms boolean) TO authenticated;


--
-- Name: TABLE bookings; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.bookings TO authenticated;


--
-- Name: COLUMN bookings.status; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(status) ON TABLE public.bookings TO authenticated;


--
-- Name: COLUMN bookings.cancel_note; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(cancel_note) ON TABLE public.bookings TO authenticated;


--
-- Name: TABLE services; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.services TO anon;
GRANT SELECT ON TABLE public.services TO authenticated;


--
-- Name: TABLE uteblivna; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.uteblivna TO authenticated;


--
-- PostgreSQL database dump complete
--

\unrestrict g2uQq6PlQtEFj6CUXYrsgsLBVTUF7GmmCiFtY9Bxrh9vVo38O0Zq3cPZrFadylI

