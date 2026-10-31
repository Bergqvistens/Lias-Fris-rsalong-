-- Lokal testdatabas för Lias Hantverkeri (PostgreSQL 16). Skapad med pg_dump 1 nov 2026 (allt i supabase-setup.sql till och med uteblivna besök del 2).
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;
--
-- PostgreSQL database dump
--

\restrict BRgjPmhjysS8i4Um8SvP7rEPIAPgxQgKhy6KhPqcfCBPLhkZ1dwAGOpV1QlrzL4

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
  if p_rules is distinct from '2026-11-01' then raise exception 'REGLER_EJ_GODKANDA'; end if;

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
        (service_ids, service_names, price, starts_at, ends_at, customer_name, customer_phone, customer_email, person_name, group_id, rules_version)
      values
        (v_ids, v_names, v_price, v_cursor, v_cursor + make_interval(mins => v_dur), p_name, p_phone, p_email, v_pname, v_group, p_rules)
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
   where coalesce(group_id, booking_id) = coalesce(b.group_id, b.id) and status in ('ingen_avgift', 'obetald');
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
declare
  b       public.bookings%rowtype;
  v_hours integer;
  v_n     integer;
  v_sum   integer;
  v_start timestamptz;
  v_row   public.uteblivna%rowtype;
begin
  if not public.is_admin() then raise exception 'EJ_ADMIN'; end if;
  if p_kind not in ('uteblev', 'sen_avbokning') then raise exception 'OGILTIG_TYP'; end if;
  select * into b from public.bookings where id = p_booking;
  if not found then raise exception 'OGILTIG_BOKNING'; end if;
  select min(starts_at), sum(price) into v_start, v_sum from public.bookings
   where (b.group_id is not null and group_id = b.group_id) or id = b.id;
  if p_kind = 'uteblev' then
    if b.status <> 'bokad' then raise exception 'OGILTIG_BOKNING'; end if;
    if v_start > now() then raise exception 'TIDEN_HAR_INTE_BORJAT'; end if;
    if b.arrived_at is not null then raise exception 'KUNDEN_HAR_KOMMIT'; end if;
  else
    if b.status <> 'avbokad' or b.cancelled_at is null then raise exception 'OGILTIG_BOKNING'; end if;
    -- 48 timmar för färg och permanent, annars 24 (samma som appens avbokningsregler)
    select case when exists (select 1 from public.services s
                              where s.id = any(b.service_ids) and s.category in ('Färgbehandling', 'Permanent'))
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


ALTER FUNCTION public.registrera_uteblivet(p_booking uuid, p_kind text) OWNER TO postgres;

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
  elsif new.status = 'avbokad' then
    new.cancelled_at := now();
  else
    new.cancelled_at := null;
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
    CONSTRAINT bookings_status_check CHECK ((status = ANY (ARRAY['bokad'::text, 'avbokad'::text]))),
    CONSTRAINT cancel_note_langd CHECK (((cancel_note IS NULL) OR (char_length(cancel_note) <= 160))),
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
    CONSTRAINT uteblivna_belopp_check CHECK ((belopp >= 0)),
    CONSTRAINT uteblivna_kind_check CHECK ((kind = ANY (ARRAY['uteblev'::text, 'sen_avbokning'::text]))),
    CONSTRAINT uteblivna_nummer_check CHECK ((nummer >= 1)),
    CONSTRAINT uteblivna_status_check CHECK ((status = ANY (ARRAY['ingen_avgift'::text, 'obetald'::text, 'betald'::text, 'havd'::text])))
);


ALTER TABLE public.uteblivna OWNER TO postgres;

--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: postgres
--

COPY auth.users (id, email) FROM stdin;
40bc0b32-226c-41c5-9aec-89376b79d769	lia@test.se
\.


--
-- Data for Name: admins; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.admins (user_id) FROM stdin;
40bc0b32-226c-41c5-9aec-89376b79d769
\.


--
-- Data for Name: bookings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bookings (id, created_at, service_ids, service_names, price, starts_at, ends_at, customer_name, customer_phone, customer_email, status, person_name, group_id, cancel_note, cancelled_at, rules_version, arrived_at) FROM stdin;
\.


--
-- Data for Name: services; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.services (id, name, duration, price, category, kind) FROM stdin;
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
klipp-45	Klippning 45 min.	45	600	Klippning	klipp
klipp-lyx	Klippning lyx	60	850	Klippning	klipp
klipp-30	Klippning/Herrklippning 30 min	30	500	Klippning	klipp
putsning	Putsning, kort hår med maskinklippn. sidor & nacke.	15	250	Klippning	klipp
\.


--
-- Data for Name: uteblivna; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.uteblivna (id, created_at, booking_id, group_id, customer_name, customer_phone, kind, nummer, belopp, status, andrad_at) FROM stdin;
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

\unrestrict BRgjPmhjysS8i4Um8SvP7rEPIAPgxQgKhy6KhPqcfCBPLhkZ1dwAGOpV1QlrzL4

