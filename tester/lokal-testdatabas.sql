-- Lokal testdatabas för Lias Hantverkeri (PostgreSQL 16). Skapad med pg_dump 26 okt 2026.
-- Roller som Supabase har inbyggda (skapas om de saknas):
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;
--
-- PostgreSQL database dump
--

\restrict h0jMh37u5QIYncARfWvpKHhb1hMOwgh1MzolsaZwPBoMUZOp5TJAGEWgeN92PTU

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
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;


--
-- Name: create_booking(text[], timestamp with time zone, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_booking(p_service_ids text[], p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_ids      text[];
  v_count    integer;
  v_duration integer;
  v_price    integer;
  v_names    text;
  v_ends_at  timestamptz;
  v_local    timestamp;     -- starttid i svensk tid
  v_local_end timestamp;
  v_dow      integer;
  v_open     time;
  v_close    time;
  v_id       uuid;
begin
  -- Rensa och kontrollera uppgifter
  p_name  := btrim(coalesce(p_name, ''));
  p_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  p_email := btrim(coalesce(p_email, ''));

  if length(p_name) < 2 or length(p_name) > 100 then
    raise exception 'OGILTIGT_NAMN';
  end if;
  if p_phone !~ '^0[0-9]{9}$' then
    raise exception 'OGILTIGT_TELEFON';
  end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then
    raise exception 'OGILTIG_EPOST';
  end if;

  -- Tjänster: pris och längd hämtas från tabellen, inte från webbsidan
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_service_ids, '{}')) x;
  if v_ids is null or cardinality(v_ids) = 0 or cardinality(v_ids) > 6 then
    raise exception 'OGILTIGA_TJANSTER';
  end if;
  select count(*), sum(duration), sum(price), string_agg(name, ', ' order by name)
    into v_count, v_duration, v_price, v_names
    from public.services where id = any(v_ids);
  if v_count <> cardinality(v_ids) then
    raise exception 'OGILTIGA_TJANSTER';
  end if;

  -- Tid: framåt i tiden, inom 60 dagar, på kvarten
  v_ends_at := p_starts_at + make_interval(mins => v_duration);
  if p_starts_at < now() + interval '30 minutes' or p_starts_at > now() + interval '60 days' then
    raise exception 'OGILTIG_TID';
  end if;
  if extract(second from p_starts_at) <> 0 or extract(minute from p_starts_at)::int % 15 <> 0 then
    raise exception 'OGILTIG_TID';
  end if;

  -- Öppettider (svensk tid). Söndag stängt.
  v_local     := p_starts_at at time zone 'Europe/Stockholm';
  v_local_end := v_ends_at   at time zone 'Europe/Stockholm';
  v_dow := extract(isodow from v_local);   -- 1 = måndag … 7 = söndag
  v_open  := case when v_dow = 6 then time '09:00' when v_dow = 7 then null else time '10:00' end;
  v_close := case when v_dow = 4 then time '20:00' when v_dow = 6 then time '15:00'
                  when v_dow = 7 then null else time '18:00' end;
  if v_open is null
     or v_local::time < v_open
     or v_local_end::date <> v_local::date
     or v_local_end::time > v_close then
    raise exception 'UTANFOR_OPPETTID';
  end if;

  -- Spara. Krockspärren i tabellen stoppar dubbelbokning.
  begin
    insert into public.bookings
      (service_ids, service_names, price, starts_at, ends_at,
       customer_name, customer_phone, customer_email)
    values
      (v_ids, v_names, v_price, p_starts_at, v_ends_at, p_name, p_phone, p_email)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'TIDEN_UPPTAGEN';
  end;

  return json_build_object(
    'id', v_id, 'starts_at', p_starts_at, 'ends_at', v_ends_at,
    'service_names', v_names, 'price', v_price, 'duration', v_duration);
end;
$_$;


--
-- Name: get_busy(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
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


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text
);


--
-- Name: admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admins (
    user_id uuid NOT NULL
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
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
    CONSTRAINT bookings_status_check CHECK ((status = ANY (ARRAY['bokad'::text, 'avbokad'::text]))),
    CONSTRAINT tid_i_ordning CHECK ((ends_at > starts_at))
);


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id text NOT NULL,
    name text NOT NULL,
    duration integer NOT NULL,
    price integer NOT NULL,
    CONSTRAINT services_duration_check CHECK ((duration > 0)),
    CONSTRAINT services_price_check CHECK ((price >= 0))
);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (user_id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: bookings ingen_krock; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT ingen_krock EXCLUDE USING gist (tstzrange(starts_at, ends_at, '[)'::text) WITH &&) WHERE ((status = 'bokad'::text));


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: bookings admin_avbokar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_avbokar ON public.bookings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: bookings admin_laser_bokningar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_laser_bokningar ON public.bookings FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

--
-- Name: services alla_laser_tjanster; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alla_laser_tjanster ON public.services FOR SELECT USING (true);


--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- Name: supabase_realtime bookings; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.bookings;


--
-- Name: SCHEMA auth; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA auth TO anon;
GRANT USAGE ON SCHEMA auth TO authenticated;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;


--
-- Name: FUNCTION uid(); Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON FUNCTION auth.uid() TO anon;
GRANT ALL ON FUNCTION auth.uid() TO authenticated;


--
-- Name: FUNCTION create_booking(p_service_ids text[], p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_booking(p_service_ids text[], p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_booking(p_service_ids text[], p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text) TO anon;
GRANT ALL ON FUNCTION public.create_booking(p_service_ids text[], p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text) TO authenticated;


--
-- Name: FUNCTION get_busy(p_from timestamp with time zone, p_to timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_busy(p_from timestamp with time zone, p_to timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_busy(p_from timestamp with time zone, p_to timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.get_busy(p_from timestamp with time zone, p_to timestamp with time zone) TO authenticated;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;


--
-- Name: TABLE bookings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.bookings TO authenticated;


--
-- Name: COLUMN bookings.status; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(status) ON TABLE public.bookings TO authenticated;


--
-- Name: TABLE services; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.services TO anon;
GRANT SELECT ON TABLE public.services TO authenticated;


--
-- PostgreSQL database dump complete
--

\unrestrict h0jMh37u5QIYncARfWvpKHhb1hMOwgh1MzolsaZwPBoMUZOp5TJAGEWgeN92PTU

--
-- PostgreSQL database dump
--

\restrict t86riQQDE3fLfviUuljr9omcqAFLamKGUnPbTvOuhgiAIY2PbcITnbuE2vlRkOT

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
-- Data for Name: services; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.services (id, name, duration, price) FROM stdin;
h-kort	Herr kort hår	20	395
h-medel	Herr medel hår	30	495
h-långt	Herr långt hår	40	595
h-färg	Färgning herr	45	349
h-skägg	Skäggtrim	15	149
h-style	Styling herr	10	99
d-kort	Dam kort hår	30	495
d-medel	Dam medel hår	45	595
d-långt	Dam långt hår	60	695
d-färg	Färgning dam	45	449
d-slingor	Slingor/highlights	60	549
d-style	Styling dam	20	149
d-fön	Fön	15	99
b-klipp	Barnklippning	25	295
\.


--
-- PostgreSQL database dump complete
--

\unrestrict t86riQQDE3fLfviUuljr9omcqAFLamKGUnPbTvOuhgiAIY2PbcITnbuE2vlRkOT

