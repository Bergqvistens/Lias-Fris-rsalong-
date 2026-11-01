P="psql -h /tmp/pg -p 5433 -U postgres -d lias -tA -q"
MON="(date_trunc('week', now() at time zone 'Europe/Stockholm') + interval '8 days')"   # testdag: nästa TISDAG 00:00 svensk tid (Lia har stängt måndagar sedan 29 okt). Namnet MON är kvar av historiska skäl.
T() { # T "beskrivning" roll uid "sql" förväntat-mönster
  out=$($P -c "set role $2" -c "set request.jwt.claim.sub = '$3'" -c "$4" 2>&1 | grep -v '^CONTEXT' | tr '\n' ' ' | sed 's/ *$//')
  if echo "$out" | grep -qE "$5"; then r="OK  "; else r="FEL "; fi
  echo "$r $1  ->  $(echo "$out" | cut -c1-110)"
}
BK() { echo "select (create_booking('$1'::jsonb, (($MON + interval '$2') at time zone 'Europe/Stockholm'), '$3', '$4', '$5', '2026-11-01-v2'))->>'service_names'"; }
P() { echo "[{\"category\":\"$1\",\"service_ids\":[$2]}]"; }   # en person: P Klippning '"klipp-45"'
# Lias tjänster (29 okt 2026): klipp-45 45 min 600 kr, klipp-30 30 min 500 kr, klipp-lyx 60 min 850 kr, bryn 30 min 200 kr,
# tvatt-fon 30 min 400 kr, harbotten 45 min 750 kr, perm-kort 120 min 1650 kr, farg-180 180 min 2500 kr. Öppet tis–fre 09–17.
$P -c "delete from bookings; delete from admins; delete from auth.users;"
LIA=$($P -c "insert into auth.users(email) values('lia@test.se') returning id" | head -1)
ANNAN=$($P -c "insert into auth.users(email) values('annan@test.se') returning id" | head -1)
$P -c "insert into admins values ('$LIA')"

echo "--- Kund bokar ---"
T "1. Giltig bokning tis 10:00, Klippning 45 min" anon "" "$(BK "$(P Klippning '"klipp-45"')" '10 hours' 'Anna Andersson' '070-123 45 67' 'anna@test.se')" "^Klippning 45 min\.$"
T "2. Krock: tis 10:15 (överlappar 10:00-10:45)" anon "" "$(BK "$(P Klippning '"klipp-30"')" '10 hours 15 minutes' 'Bo B' '0701111111' 'bo@test.se')" "TIDEN_UPPTAGEN"
T "3. Tis 10:50 är inte på kvart" anon "" "$(BK "$(P 'Frans och/eller brynfärg' '"bryn"')" '10 hours 50 minutes' 'Bo B' '0701111111' 'bo@test.se')" "OGILTIG_TID"
T "4. Direkt efter: tis 10:45 (ledig), bryn 30 min" anon "" "$(BK "$(P 'Frans och/eller brynfärg' '"bryn"')" '10 hours 45 minutes' 'Bo B' '0701111111' 'bo@test.se')" "^Färg och form av bryn\.$"
T "5. Måndag (stängt)" anon "" "$(BK "$(P Klippning '"klipp-30"')" '6 days 11 hours' 'Cia C' '0702222222' 'cia@test.se')" "UTANFOR_OPPETTID"
T "6. Före öppning tis 08:45 (öppnar 09)" anon "" "$(BK "$(P Klippning '"klipp-30"')" '8 hours 45 minutes' 'Cia C' '0702222222' 'cia@test.se')" "UTANFOR_OPPETTID"
T "7. Slutar efter stängning tis 16:30 + 45 min (stänger 17)" anon "" "$(BK "$(P Klippning '"klipp-45"')" '16 hours 30 minutes' 'Cia C' '0702222222' 'cia@test.se')" "UTANFOR_OPPETTID"
T "8. Fredag 16:30–17:00, sista tiden före stängning" anon "" "$(BK "$(P Klippning '"klipp-30"')" '3 days 16 hours 30 minutes' 'Cia C' '0702222222' 'cia@test.se')" "^Klippning/Herrklippning 30 min$"
T "9. Lördag 11:00 (öppet vid förfrågan, ingen onlinebokning)" anon "" "$(BK "$(P Klippning '"klipp-30"')" '4 days 11 hours' 'Cia C' '0702222222' 'cia@test.se')" "UTANFOR_OPPETTID"
T "10. Tid i dåtid" anon "" "select create_booking('[{\"category\":\"Klippning\",\"service_ids\":[\"klipp-30\"]}]'::jsonb, now() - interval '1 day', 'Cia C', '0702222222', 'cia@test.se', '2026-11-01-v2')" "OGILTIG_TID"
T "11. Fel telefon (9 siffror)" anon "" "$(BK "$(P Klippning '"klipp-30"')" '1 day 12 hours' 'Cia C' '070222222' 'cia@test.se')" "OGILTIGT_TELEFON"
T "12. Fel e-post" anon "" "$(BK "$(P Klippning '"klipp-30"')" '1 day 12 hours' 'Cia C' '0702222222' 'cia.test.se')" "OGILTIG_EPOST"
T "13. Tomt namn" anon "" "$(BK "$(P Klippning '"klipp-30"')" '1 day 12 hours' ' ' '0702222222' 'cia@test.se')" "OGILTIGT_NAMN"
T "14. Påhittad tjänst" anon "" "$(BK "$(P Klippning '"gratis"')" '1 day 12 hours' 'Cia C' '0702222222' 'cia@test.se')" "OGILTIGA_TJANSTER"
T "15. Inga tjänster" anon "" "$(BK "$(P Klippning "")" '1 day 12 hours' 'Cia C' '0702222222' 'cia@test.se')" "OGILTIGA_TJANSTER"

echo "--- Behörigheter ---"
T "16. Kund läser bokningstabellen" anon "" "select count(*) from bookings" "permission denied"
T "17. Kund ser upptagna tider (utan namn)" anon "" "select string_agg(to_char(starts_at at time zone 'Europe/Stockholm','HH24:MI')||'-'||to_char(ends_at at time zone 'Europe/Stockholm','HH24:MI'), ' ') from get_busy(($MON at time zone 'Europe/Stockholm'), ($MON + interval '1 day') at time zone 'Europe/Stockholm')" "^10:00-10:45 10:45-11:15$"
T "18. Kund försöker avboka" anon "" "update bookings set status='avbokad'" "permission denied"
T "19. Kund försöker ändra pris" anon "" "update bookings set price=0" "permission denied"
T "20. Inloggad men INTE admin läser" authenticated "$ANNAN" "select count(*) from bookings" "^0$"
T "21. Inloggad men INTE admin avbokar" authenticated "$ANNAN" "update bookings set status='avbokad' returning id" "^$|UPDATE 0"
T "22. Admin (Lia) ser alla bokningar" authenticated "$LIA" "select count(*) from bookings where status='bokad'" "^3$"
T "23. Admin får INTE ändra pris" authenticated "$LIA" "update bookings set price=0" "permission denied"
T "24. Admin avbokar tis 10:00" authenticated "$LIA" "update bookings set status='avbokad' where service_names like 'Klippning 45%' returning service_names" "^Klippning 45 min\.$"
T "25. Tis 10:00 är ledig igen" anon "" "$(BK "$(P Klippning '"klipp-45"')" '10 hours' 'Dan D' '0703333333' 'dan@test.se')" "^Klippning 45 min\.$"
T "26. Pris räknas av servern (från-pris 600 kr)" authenticated "$LIA" "select price from bookings where customer_name='Anna Andersson'" "^600$"
T "27. Telefon sparas utan mellanslag" authenticated "$LIA" "select customer_phone from bookings where customer_name='Anna Andersson'" "^0701234567$"

echo "--- Flera personer (en frisör: efter varandra) ---"
TRE='[{"category":"Klippning","service_ids":["klipp-30"],"name":"Kalle"},{"category":"Frans och/eller brynfärg","service_ids":["bryn"],"name":"Anna"},{"category":"Styling, tvätt & föning","service_ids":["tvatt-fon"],"name":"Lisa"}]'
T "28. Två huvudtjänster för samma person" anon "" "$(BK "$(P Klippning '"klipp-45","klipp-30"')" '1 day 12 hours' 'Cia C' '0702222222' 'cia@test.se')" "EN_KLIPPNING_PER_PERSON"
T "29. Två tjänster från olika kategorier för samma person" anon "" "$(BK "$(P Klippning '"klipp-30","bryn"')" '1 day 12 hours' 'Cia C' '0702222222' 'cia@test.se')" "OGILTIGA_TJANSTER"
T "30. Tjänst angiven med fel kategori (Klippning som Färgbehandling)" anon "" "$(BK "$(P Färgbehandling '"klipp-30"')" '1 day 12 hours' 'Cia C' '0702222222' 'cia@test.se')" "OGILTIGA_TJANSTER"
T "31. Tre personer utan förnamn" anon "" "$(BK '[{"category":"Klippning","service_ids":["klipp-30"]},{"category":"Frans och/eller brynfärg","service_ids":["bryn"]},{"category":"Styling, tvätt & föning","service_ids":["tvatt-fon"]}]' '1 day 12 hours' 'Eva E' '0704444444' 'eva@test.se')" "OGILTIGT_PERSONNAMN"
T "32. Fem personer (max 4)" anon "" "$(BK '[{"category":"Styling, tvätt & föning","service_ids":["tvatt-fon"],"name":"A1"},{"category":"Styling, tvätt & föning","service_ids":["tvatt-fon"],"name":"A2"},{"category":"Styling, tvätt & föning","service_ids":["tvatt-fon"],"name":"A3"},{"category":"Styling, tvätt & föning","service_ids":["tvatt-fon"],"name":"A4"},{"category":"Styling, tvätt & föning","service_ids":["tvatt-fon"],"name":"A5"}]' '1 day 12 hours' 'Eva E' '0704444444' 'eva@test.se')" "OGILTIGT_ANTAL_PERSONER"
T "33. Tre personer ons 12:00 (30 + 30 + 30 min)" anon "" "$(BK "$TRE" '1 day 12 hours' 'Eva Ek' '0704444444' 'eva@test.se')" "Kalle: Klippning/Herrklippning 30 min; Anna: Färg och form av bryn\.; Lisa: Tvätt & fön"
T "34. Raderna ligger efter varandra med förnamn och pris" authenticated "$LIA" "select string_agg(person_name||' '||to_char(starts_at at time zone 'Europe/Stockholm','HH24:MI')||'-'||to_char(ends_at at time zone 'Europe/Stockholm','HH24:MI')||' '||price, ', ' order by starts_at) from bookings where customer_name='Eva Ek'" "^Kalle 12:00-12:30 500, Anna 12:30-13:00 200, Lisa 13:00-13:30 400$"
T "35. Samma grupp-id för alla tre" authenticated "$LIA" "select count(distinct group_id)||' '||count(*) from bookings where customer_name='Eva Ek'" "^1 3$"
T "36. Ny grupp ons 11:30 (30+30 min) krockar med Kalle kl 12:00" anon "" "$(BK '[{"category":"Klippning","service_ids":["klipp-30"],"name":"Olle"},{"category":"Frans och/eller brynfärg","service_ids":["bryn"],"name":"Stina"}]' '1 day 11 hours 30 minutes' 'Ulf U' '0705555555' 'ulf@test.se')" "TIDEN_UPPTAGEN"
T "37. Inget sparades av den krockande gruppen (allt eller inget)" authenticated "$LIA" "select count(*) from bookings where customer_name='Ulf U'" "^0$"
T "38. Grupp som slutar efter stängning (fre 16:00, 30+30+30 min)" anon "" "$(BK '[{"category":"Styling, tvätt & föning","service_ids":["tvatt-fon"],"name":"B1"},{"category":"Styling, tvätt & föning","service_ids":["tvatt-fon"],"name":"B2"},{"category":"Styling, tvätt & föning","service_ids":["tvatt-fon"],"name":"B3"}]' '3 days 16 hours' 'Ulf U' '0705555555' 'ulf@test.se')" "UTANFOR_OPPETTID"
T "39. En person: inget förnamn behövs, sparas utan person_name" anon "" "$(BK "$(P Hårbottenmassage '"harbotten"')" '2 days 10 hours' 'Ulf U' '0705555555' 'ulf@test.se')" "^Hårbottenmassage$"
T "40. Pris och tid från servern, inte webbsidan (Permanent kort = 1650 kr, 120 min)" anon "" "select (r->>'price')||' '||(r->>'duration') from (select create_booking('[{\"category\":\"Permanent\",\"service_ids\":[\"perm-kort\"],\"price\":1}]'::jsonb, (($MON + interval '2 days 14 hours') at time zone 'Europe/Stockholm'), 'Pia P', '0706666666', 'pia@test.se', '2026-11-01-v2') r) x" "^1650 120$"
T "41. Kunden kan inte läsa förnamnen via get_busy" anon "" "select count(*) from get_busy(now(), now() + interval '14 days') g where row_to_json(g)::text like '%Kalle%'" "^0$"
T "42. Torsdag 09:00, första tiden (öppnar 09), slutar 10:00 direkt före nästa bokning" anon "" "$(BK "$(P 'Styling, tvätt & föning' '"tvatt-fon-60"')" '2 days 9 hours' 'Gun G' '0707777777' 'gun@test.se')" "^Tvätt & fön/ styling 1 timma$"
T "43. Söndag 11:00 (stängt)" anon "" "$(BK "$(P Klippning '"klipp-30"')" '5 days 11 hours' 'Gun G' '0707777777' 'gun@test.se')" "UTANFOR_OPPETTID"

echo "--- Lias tjänster (ny 29 okt) ---"
T "44. Längsta tjänsten (Färgbehandling 3 h) fre 13:30–16:30 går att boka (direkt före nästa)" anon "" "$(BK "$(P Färgbehandling '"farg-180"')" '3 days 13 hours 30 minutes' 'Hans H' '0708888888' 'hans@test.se')" "^Färgbehandling 3 timmar, klippning ingår\.$"
T "45. Färgbehandling 3 h tis 14:15 slutar 17:15 (efter stängning)" anon "" "$(BK "$(P Färgbehandling '"farg-180"')" '14 hours 15 minutes' 'Hans H' '0708888888' 'hans@test.se')" "UTANFOR_OPPETTID"
T "46. Gamla kategorin Herr finns inte längre" anon "" "$(BK "$(P Herr '"klipp-30"')" '2 days 11 hours' 'Hans H' '0708888888' 'hans@test.se')" "OGILTIGA_TJANSTER"
T "47. Alla 17 tjänster finns i databasen, i 6 kategorier" anon "" "select count(*)||' '||count(distinct category) from services" "^17 6$"

echo "--- Avbokningsmeddelande (ny 30 okt) ---"
T "48. Admin sparar ett meddelande vid avbokning" authenticated "$LIA" "update bookings set status='avbokad', cancel_note='Din frisör Lia är tyvärr sjuk och måste avboka din tid.' where id=(select id from bookings where status='bokad' order by starts_at limit 1) returning cancel_note" "^Din frisör Lia är tyvärr sjuk och måste avboka din tid\.$"
T "49. Meddelande längre än 160 tecken stoppas" authenticated "$LIA" "update bookings set cancel_note=repeat('x',161) where id=(select id from bookings where status='bokad' order by starts_at limit 1)" "cancel_note_langd"
T "50. Inloggad men INTE admin kan inte skriva meddelande" authenticated "$ANNAN" "update bookings set cancel_note='hej' returning id" "^$|UPDATE 0"
T "51. Kund (ej inloggad) kan inte skriva meddelande" anon "" "update bookings set cancel_note='hej'" "permission denied"
T "52. Admin får fortfarande INTE ändra pris" authenticated "$LIA" "update bookings set price=0" "permission denied"

echo "--- Avbokningstid och rensning efter 12 månader (ny 30 okt) ---"
$P -c "update bookings set status='bokad', cancel_note=null, cancelled_at=null where customer_name='Tidstest'" >/dev/null 2>&1
$P -c "delete from bookings where customer_name in ('Tidstest','Gammal13','Gammal11')" >/dev/null
$P -c "insert into bookings (service_ids, service_names, price, starts_at, ends_at, customer_name, customer_phone, customer_email, status) values ('{klipp-30}','Klippning/Herrklippning 30 min',500, $MON + interval '5 days 8 hours', $MON + interval '5 days 8 hours 30 minutes','Tidstest','0701111111','t@t.se','bokad')" >/dev/null
T "53. Avbokning: databasen stämplar tiden själv (serverns klocka)" authenticated "$LIA" "update bookings set status='avbokad', cancel_note='Din frisör Lia måste tyvärr boka om din tid.' where customer_name='Tidstest' returning (abs(extract(epoch from (cancelled_at - now()))) < 5)::text" "^true$"
T "54. Admin kan inte själv ändra avbokningstiden" authenticated "$LIA" "update bookings set cancelled_at = now() - interval '1 day' where customer_name='Tidstest'" "permission denied"
T "55. Efter avbokning är meddelandet låst (kan inte ändras i efterhand)" authenticated "$LIA" "update bookings set cancel_note='Ändrad text' where customer_name='Tidstest' returning cancel_note" "^Din frisör Lia måste tyvärr boka om din tid\.$"
T "56. Tiden är också låst vid ny uppdatering" authenticated "$LIA" "with f as (select cancelled_at t from bookings where customer_name='Tidstest') update bookings b set status='avbokad' from f where customer_name='Tidstest' returning (b.cancelled_at = f.t)::text" "^true$"
$P -c "insert into bookings (service_ids, service_names, price, starts_at, ends_at, customer_name, customer_phone, customer_email, status, cancelled_at) values ('{klipp-30}','X',500, now() - interval '14 months', now() - interval '14 months' + interval '30 minutes','Gammal13','0701111111','g@t.se','avbokad', now() - interval '13 months'), ('{klipp-30}','X',500, now() - interval '12 months', now() - interval '12 months' + interval '30 minutes','Gammal11','0701111111','g@t.se','avbokad', now() - interval '11 months')" >/dev/null
T "57. Kund kan inte köra rensningen" anon "" "select rensa_gamla_avbokningar()" "permission denied"
T "58. Inloggad men INTE admin kan inte köra rensningen" authenticated "$ANNAN" "select rensa_gamla_avbokningar()" "EJ_ADMIN"
T "59. Ingen utom databasen kan köra den interna rensningen" authenticated "$LIA" "select rensa_gamla_avbokningar_kor()" "permission denied"
T "60. Admin: rensningen tar bort avbokningar äldre än 12 månader (1 st)" authenticated "$LIA" "select rensa_gamla_avbokningar()" "^1$"
R=$($P -c "select string_agg(customer_name, ',' order by customer_name) from bookings where customer_name in ('Tidstest','Gammal13','Gammal11')")
if [ "$R" = "Gammal11,Tidstest" ]; then echo "OK   61. Kvar efter rensning (11 månader gammal + dagens): $R"; else echo "FEL  61. Kvar efter rensning (11 månader gammal + dagens): $R"; fi
$P -c "delete from bookings where customer_name in ('Tidstest','Gammal13','Gammal11')" >/dev/null

echo "--- Inga korta luckor (ny 31 okt, Lia valde B: lucka 0 eller minst 45 min) ---"
$P -c "delete from bookings where customer_name like 'Lucka%'" >/dev/null
T "62. Grund: tisdag om en vecka 10:00–10:45" anon "" "$(BK "$(P Klippning '"klipp-45"')" '7 days 10 hours' 'Lucka A' '0701010101' 'l@t.se')" "^Klippning 45 min\.$"
T "63. 11:00 lämnar 15 min lucka efter 10:45 → stoppas" anon "" "$(BK "$(P Klippning '"klipp-30"')" '7 days 11 hours' 'Lucka B' '0701010102' 'l@t.se')" "KORT_LUCKA"
T "64. 09:15–10:00 lämnar 15 min lucka efter öppning → stoppas" anon "" "$(BK "$(P Klippning '"klipp-45"')" '7 days 9 hours 15 minutes' 'Lucka C' '0701010103' 'l@t.se')" "KORT_LUCKA"
T "65. 09:00–09:30 lämnar 30 min lucka före 10:00 → stoppas" anon "" "$(BK "$(P Klippning '"klipp-30"')" '7 days 9 hours' 'Lucka D' '0701010104' 'l@t.se')" "KORT_LUCKA"
T "66. 10:45 direkt efter → går att boka" anon "" "$(BK "$(P Klippning '"klipp-30"')" '7 days 10 hours 45 minutes' 'Lucka E' '0701010105' 'l@t.se')" "^Klippning/Herrklippning 30 min$"
T "67. 12:00 lämnar 45 min lucka (11:15–12:00) → går att boka" anon "" "$(BK "$(P Klippning '"klipp-30"')" '7 days 12 hours' 'Lucka F' '0701010106' 'l@t.se')" "^Klippning/Herrklippning 30 min$"
T "68. 16:15–17:00 slutar vid stängning (0 min) → går att boka" anon "" "$(BK "$(P Klippning '"klipp-45"')" '7 days 16 hours 15 minutes' 'Lucka G' '0701010107' 'l@t.se')" "^Klippning 45 min\.$"
T "69. 15:45–16:00 (putsning) lämnar 15 min före 16:15 → stoppas" anon "" "$(BK "$(P Klippning '"putsning"')" '7 days 15 hours 45 minutes' 'Lucka H' '0701010108' 'l@t.se')" "KORT_LUCKA"
T "70. Grupp 09:00 (30+30 min) slutar 10:00 direkt före → går att boka" anon "" "$(BK '[{"category":"Klippning","service_ids":["klipp-30"],"name":"G1"},{"category":"Frans och/eller brynfärg","service_ids":["bryn"],"name":"G2"}]' '7 days 9 hours' 'Lucka I' '0701010109' 'l@t.se')" "G1: Klippning/Herrklippning 30 min"
$P -c "delete from bookings where customer_name like 'Lucka%'" >/dev/null

echo "--- Avbokningsregler måste godkännas (ny 1 nov) ---"
T "71. Bokning utan godkända regler stoppas" anon "" "select create_booking('[{\"category\":\"Klippning\",\"service_ids\":[\"klipp-30\"]}]'::jsonb, (($MON + interval '8 days 9 hours') at time zone 'Europe/Stockholm'), 'Rut R', '0701212121', 'r@t.se')" "REGLER_EJ_GODKANDA"
T "72. Bokning med gammal regelversion (v1) stoppas" anon "" "select create_booking('[{\"category\":\"Klippning\",\"service_ids\":[\"klipp-30\"]}]'::jsonb, (($MON + interval '8 days 9 hours') at time zone 'Europe/Stockholm'), 'Rut R', '0701212121', 'r@t.se', '2026-11-01')" "REGLER_EJ_GODKANDA"
T "73. Med godkända regler går det att boka" anon "" "$(BK "$(P Klippning '"klipp-30"')" '8 days 9 hours' 'Rut R' '0701212121' 'r@t.se')" "^Klippning/Herrklippning 30 min$"
T "74. Regelversionen sparas på bokningen (bevis)" authenticated "$LIA" "select rules_version || ' ' || (abs(extract(epoch from created_at - now())) < 60)::text from bookings where customer_name='Rut R'" "^2026-11-01-v2 true$"
$P -c "delete from bookings where customer_name='Rut R'" >/dev/null

echo "--- Uteblivet besök och sen avbokning (ny 1 nov) ---"
$P -c "delete from uteblivna where customer_phone in ('0709990000','0709990001')" >/dev/null
$P -c "delete from bookings where customer_phone in ('0709990000','0709990001')" >/dev/null
INS() { $P -c "insert into bookings (id, service_ids, service_names, price, starts_at, ends_at, customer_name, customer_phone, customer_email, status, group_id) values ('$1', '{$2}', 'X', $3, $4, $4 + interval '30 minutes', 'Ute Test', '${6:-0709990000}', 'u@t.se', 'bokad', ${5:-null})" >/dev/null; }
INS 00000000-0000-4000-8000-000000000001 klipp-30 500 "now() - interval '10 days'"
INS 00000000-0000-4000-8000-000000000002 farg-150 1200 "now() - interval '9 days'"
INS 00000000-0000-4000-8000-000000000003 klipp-45 600 "now() - interval '8 days'"
INS 00000000-0000-4000-8000-000000000004 klipp-30 500 "now() - interval '7 days'"
INS 00000000-0000-4000-8000-000000000005 klipp-30 500 "date_trunc('day', now() + interval '20 days') + interval '5 hours'"   # 1 nov: tid som inte krockar med andra testbokningar
U1=00000000-0000-4000-8000-000000000001; U2=00000000-0000-4000-8000-000000000002; U3=00000000-0000-4000-8000-000000000003; U4=00000000-0000-4000-8000-000000000004; U5=00000000-0000-4000-8000-000000000005
T "75. Kund kan inte registrera uteblivet" anon "" "select registrera_uteblivet('$U1', 'uteblev')" "permission denied"
T "76. Inloggad men INTE admin kan inte registrera" authenticated "$ANNAN" "select registrera_uteblivet('$U1', 'uteblev')" "EJ_ADMIN"
T "77. Tid som inte har börjat kan inte registreras som utebliven" authenticated "$LIA" "select registrera_uteblivet('$U5', 'uteblev')" "TIDEN_HAR_INTE_BORJAT"
T "78. 1:a gången: ingen avgift" authenticated "$LIA" "select (r->>'nummer')||' '||(r->>'belopp')||' '||(r->>'status') from (select registrera_uteblivet('$U1', 'uteblev')::json r) x" "^1 0 ingen_avgift$"
T "79. Samma bokning kan inte registreras två gånger" authenticated "$LIA" "select registrera_uteblivet('$U1', 'uteblev')" "REDAN_REGISTRERAD"
T "80. 2:a gången: hela priset för behandlingen (1200 kr)" authenticated "$LIA" "select (r->>'nummer')||' '||(r->>'belopp')||' '||(r->>'status') from (select registrera_uteblivet('$U2', 'uteblev')::json r) x" "^2 1200 obetald$"
T "81. 3:e gången: hela priset (600 kr)" authenticated "$LIA" "select (r->>'nummer')||' '||(r->>'belopp')||' '||(r->>'status') from (select registrera_uteblivet('$U3', 'uteblev')::json r) x" "^3 600 obetald$"
T "82. Kunden kom ändå (3:e): avgiften hävs" authenticated "$LIA" "select markera_kommit('$U3') is not null; select status from uteblivna where booking_id='$U3'" "havd$"
T "83. Lia kan inte skriva direkt i tabellen (bara via funktionerna)" authenticated "$LIA" "update uteblivna set belopp = 0" "permission denied"
T "84. Annan inloggad (inte admin) ser inga registreringar" authenticated "$ANNAN" "select count(*) from uteblivna where customer_phone='0709990000'" "^0$"
T "85. Avgift kan inte markeras betald om den var gratis" authenticated "$LIA" "select uteblivet_andra((select id from uteblivna where booking_id='$U1'), 'betald')" "OGILTIG_STATUS"
T "86. 2:a gångens avgift betald" authenticated "$LIA" "select uteblivet_andra((select id from uteblivna where booking_id='$U2'), 'betald')->>'status'" "^betald$"
T "87. Betalning nollställer inte (Lia 1 nov) och 'kunden kom ändå' räknas inte: nästa = 3:e, 500 kr" authenticated "$LIA" "select (r->>'nummer')||' '||(r->>'belopp')||' '||(r->>'status') from (select registrera_uteblivet('$U4', 'uteblev')::json r) x" "^3 500 obetald$"
INS 00000000-0000-4000-8000-000000000006 klipp-30 500 "now() + interval '5 hours'"
INS 00000000-0000-4000-8000-000000000007 klipp-30 500 "date_trunc('day', now() + interval '5 days') + interval '5 hours'"   # 1 nov: krockfri tid (05:00), annars krockade den ibland med fredagens testbokning
T "88. Lia avbokar (kunden ringde 5 h före): sen avbokning registreras, 4:e gången = 500 kr" authenticated "$LIA" "with a as (update bookings set status='avbokad' where id='00000000-0000-4000-8000-000000000006' returning id) select (r->>'kind')||' '||(r->>'nummer')||' '||(r->>'belopp') from (select registrera_uteblivet('00000000-0000-4000-8000-000000000006', 'sen_avbokning')::json r from a) x" "sen_avbokning 4 500"
$P -c "update bookings set status='avbokad' where id='00000000-0000-4000-8000-000000000007'" >/dev/null
T "89. Avbokning 5 dagar före räknas inte som sen" authenticated "$LIA" "select registrera_uteblivet('00000000-0000-4000-8000-000000000007', 'sen_avbokning')" "INTE_SEN_AVBOKNING"
T "89a. Lia efterskänker 3:e gången" authenticated "$LIA" "select uteblivet_andra((select id from uteblivna where booking_id='$U4'), 'efterskankt')->>'status'" "^efterskankt$"
T "89b. Det gamla värdet 'havd' går inte att sätta via knappen (bara 'kunden kom ändå')" authenticated "$LIA" "select uteblivet_andra((select id from uteblivna where booking_id='00000000-0000-4000-8000-000000000006'), 'havd')" "OGILTIG_STATUS"
T "89c. Efterskänkt räknas ändå: nästa för 0709990000 blir 5:e (1, 2 betald, 3 efterskänkt, 4 – kom ändå räknas inte)" authenticated "$LIA" "select uteblivet_forhand('0709990000')" "^5$"
G=00000000-0000-4000-8000-0000000000aa
INS 00000000-0000-4000-8000-000000000011 klipp-30 500 "now() - interval '14 months'" null 0709990001
$P -c "insert into uteblivna (created_at, booking_id, customer_name, customer_phone, kind, nummer, belopp, status) values (now() - interval '13 months', '00000000-0000-4000-8000-000000000011', 'Ute Test', '0709990001', 'uteblev', 1, 0, 'ingen_avgift')" >/dev/null
INS 00000000-0000-4000-8000-000000000008 klipp-30 500 "now() - interval '5 days'" "'$G'" 0709990001
INS 00000000-0000-4000-8000-000000000009 bryn 200 "now() - interval '5 days' + interval '30 minutes'" "'$G'" 0709990001
INS 00000000-0000-4000-8000-000000000010 klipp-30 500 "now() - interval '6 days'" null 0709990001
T "90. Annat nummer räknas för sig: 1:a gången (en registrering för 13 månader sedan räknas inte)" authenticated "$LIA" "select registrera_uteblivet('00000000-0000-4000-8000-000000000010', 'uteblev')->>'nummer'" "^1$"
T "91. Gruppbokning (2 personer) räknas som EN gång, beloppet = hela bokningen (500 + 200)" authenticated "$LIA" "select (r->>'nummer')||' '||(r->>'belopp') from (select registrera_uteblivet('00000000-0000-4000-8000-000000000009', 'uteblev')::json r) x" "^2 700$"
T "92. Gruppens andra person kan inte registreras igen" authenticated "$LIA" "select registrera_uteblivet('00000000-0000-4000-8000-000000000008', 'uteblev')" "REDAN_REGISTRERAD"
T "93. Förhandsbesked för Lia: nästa gång för 0709990001 blir 3:e" authenticated "$LIA" "select uteblivet_forhand('070-999 00 01')" "^3$"
$P -c "delete from uteblivna where customer_phone in ('0709990000','0709990001')" >/dev/null
$P -c "delete from bookings where customer_phone in ('0709990000','0709990001')" >/dev/null

echo "--- Automatik: uteblivet efter 15 minuter (ny 1 nov) ---"
$P -c "delete from uteblivna where customer_phone like '070888%'" >/dev/null
$P -c "delete from bookings where customer_phone like '070888%'" >/dev/null
INA() { $P -c "insert into bookings (id, service_ids, service_names, price, starts_at, ends_at, customer_name, customer_phone, customer_email, status, group_id, rules_version, arrived_at) values ('$1', '{klipp-30}', 'X', 500, $2, $2 + interval '5 minutes', 'Auto Test', '$3', 'a@t.se', 'bokad', null, $4, $5)" >/dev/null; }
INA 00000000-0000-4000-8000-0000000000b1 "now() - interval '20 minutes'" 0708880001 "'2026-11-01'" null
INA 00000000-0000-4000-8000-0000000000b2 "now() - interval '10 minutes'" 0708880002 "'2026-11-01'" null
INA 00000000-0000-4000-8000-0000000000b3 "now() - interval '40 minutes'" 0708880003 "'2026-11-01'" "now() - interval '35 minutes'"
INA 00000000-0000-4000-8000-0000000000b4 "now() - interval '50 minutes'" 0708880004 null null
INA 00000000-0000-4000-8000-0000000000b5 "now() - interval '3 days'" 0708880005 "'2026-11-01'" null
T "94. Kund kan inte köra automatiken" anon "" "select auto_uteblivna()" "permission denied"
T "95. Ingen utom databasen kan köra den interna automatiken" authenticated "$LIA" "select auto_uteblivna_kor()" "permission denied"
T "96. Interna registreringen kan inte anropas direkt" authenticated "$LIA" "select registrera_uteblivet_kor('00000000-0000-4000-8000-0000000000b1', 'uteblev')" "permission denied"
T "97. Automatiken registrerar exakt 1 (20 min sedan, inte kommit, regler godkända)" authenticated "$LIA" "select auto_uteblivna()" "^1$"
T "98. Rätt bokning: den som började för 20 min sedan" authenticated "$LIA" "select string_agg(customer_phone, ',') from uteblivna where customer_phone like '070888%'" "^0708880001$"
T "99. Inte: 10 min sedan (före 15), kunden kom, regler ej godkända, äldre än ett dygn – körs igen: 0 nya" authenticated "$LIA" "select auto_uteblivna()" "^0$"
$P -c "delete from uteblivna where customer_phone like '070888%'" >/dev/null
$P -c "delete from bookings where customer_phone like '070888%'" >/dev/null

echo "--- Sen ankomst och skicka varning/debitering (ny 1 nov) ---"
$P -c "delete from uteblivna where customer_phone like '070777%'" >/dev/null
$P -c "delete from bookings where customer_phone like '070777%'" >/dev/null
INB() { $P -c "insert into bookings (id, service_ids, service_names, price, starts_at, ends_at, customer_name, customer_phone, customer_email, status, arrived_at) values ('$1', '{klipp-30}', 'X', $2, $3, $3 + interval '30 minutes', 'Sen Test', '0707770001', 's@t.se', 'bokad', $4)" >/dev/null; }
INB 00000000-0000-4000-8000-0000000000c1 500 "now() - interval '3 minutes'" "now()"
INB 00000000-0000-4000-8000-0000000000c2 500 "now() - interval '2 days'" "now() - interval '2 days' + interval '10 minutes'"
INB 00000000-0000-4000-8000-0000000000c3 800 "now() - interval '1 day'" null
T "100. Sen ankomst efter bara 3 minuter går inte (gräns 5 min)" authenticated "$LIA" "select registrera_uteblivet('00000000-0000-4000-8000-0000000000c1', 'sen_ankomst')" "INTE_SEN_ANKOMST"
T "101. Sen ankomst (kom 10 min sent): 1:a gången, ingen avgift" authenticated "$LIA" "select (r->>'kind')||' '||(r->>'nummer')||' '||(r->>'belopp') from (select registrera_uteblivet('00000000-0000-4000-8000-0000000000c2', 'sen_ankomst')::json r) x" "^sen_ankomst 1 0$"
T "102. \"Kunden kom\" häver inte en sen ankomst" authenticated "$LIA" "select markera_kommit('00000000-0000-4000-8000-0000000000c2') is not null; select status from uteblivna where booking_id='00000000-0000-4000-8000-0000000000c2'" "ingen_avgift$"
T "103. Okänd orsak stoppas" authenticated "$LIA" "select uteblivet_skicka((select id from uteblivna where booking_id='00000000-0000-4000-8000-0000000000c2'), 'trafik')" "OGILTIG_ORSAK"
T "104. Kund kan inte skicka" anon "" "select uteblivet_skicka((select id from uteblivna limit 1), 'sena ankomst')" "permission denied"
T "105. Varning (1:a gången) skickas: tid sparas, ingen förfallodag" authenticated "$LIA" "select (r->>'orsak')||' '||((r->>'skickat_at') is not null)::text||' '||coalesce(r->>'forfaller','ingen') from (select uteblivet_skicka((select id from uteblivna where booking_id='00000000-0000-4000-8000-0000000000c2'), 'sena ankomst')::json r) x" "^sena ankomst true ingen$"
T "106. Kan inte skickas två gånger" authenticated "$LIA" "select uteblivet_skicka((select id from uteblivna where booking_id='00000000-0000-4000-8000-0000000000c2'), 'sena ankomst')" "REDAN_SKICKAT"
T "107. 2:a gången (uteblev, 800 kr): debitering med sista betalningsdag om 7 dagar" authenticated "$LIA" "select registrera_uteblivet('00000000-0000-4000-8000-0000000000c3', 'uteblev') is not null; select (r->>'belopp')||' '||((r->>'forfaller')::date = (now() at time zone 'Europe/Stockholm')::date + 7)::text from (select uteblivet_skicka((select id from uteblivna where booking_id='00000000-0000-4000-8000-0000000000c3'), 'uteblivna bokning')::json r) x" "800 true$"
T "108. Inloggad men INTE admin kan inte skicka" authenticated "$ANNAN" "select uteblivet_skicka((select id from uteblivna limit 1), 'sena ankomst')" "EJ_ADMIN"
$P -c "delete from uteblivna where customer_phone like '070777%'" >/dev/null
$P -c "delete from bookings where customer_phone like '070777%'" >/dev/null

echo "--- Kundens länk: bekräfta, boka om, avboka (ny 1 nov, del B) ---"
$P -c "delete from uteblivna where customer_phone like '070666%'" >/dev/null
$P -c "delete from bookings where customer_phone like '070666%'" >/dev/null
$P -c "delete from bookings where starts_at between now() - interval '1 hour' and now() + interval '50 hours'" >/dev/null   # fri plats för direktinlagda testrader
W="(date_trunc('week', now() at time zone 'Europe/Stockholm') + interval '15 days')"   # tisdag om 9–15 dagar (svensk tid 00:00)
TK1=00000000-0000-4000-8000-0000000000d1; G1=00000000-0000-4000-8000-0000000000e1
$P -c "insert into bookings (service_ids, service_names, price, starts_at, ends_at, customer_name, customer_phone, customer_email, status, person_name, group_id, rules_version, confirm_token) values
 ('{klipp-30}', 'Klippning/Herrklippning 30 min', 500, ($W + interval '10 hours') at time zone 'Europe/Stockholm', ($W + interval '10 hours 30 minutes') at time zone 'Europe/Stockholm', 'Kim Kund', '0706660001', 'kim@t.se', 'bokad', 'Kalle', '$G1', '2026-11-01-v2', '$TK1'),
 ('{bryn}', 'Färg och form av bryn.', 200, ($W + interval '10 hours 30 minutes') at time zone 'Europe/Stockholm', ($W + interval '11 hours') at time zone 'Europe/Stockholm', 'Kim Kund', '0706660001', 'kim@t.se', 'bokad', 'Anna', '$G1', '2026-11-01-v2', '$TK1')" >/dev/null
NY="(($W + interval '13 hours') at time zone 'Europe/Stockholm')"
T "109. Trasig länk" anon "" "select confirm_booking('abc')" "OGILTIG_LANK"
T "110. Okänd länk (giltigt format)" anon "" "select confirm_booking('00000000-0000-4000-8000-00000000ffff')" "OGILTIG_LANK"
T "111. Kunden öppnar länken: bekräftas, 700 kr, 24 tim, inte sent, kan ändras, 2 personer" anon "" "select (r->>'already')||' '||(r->>'price')||' '||(r->>'cancel_hours')||' '||(r->>'late')||' '||(r->>'can_change')||' '||json_array_length(r->'items') from (select confirm_booking('$TK1') r) x" "^false 700 24 false true 2$"
T "112. Öppnar igen: redan bekräftad" anon "" "select confirm_booking('$TK1')->>'already'" "^true$"
T "113. Kund får inte läsa tabellen direkt med token" anon "" "select count(*) from bookings where confirm_token='$TK1'" "permission denied"
T "114. Boka om utan godkända regler stoppas" anon "" "select kund_omboka('$TK1', $NY)" "REGLER_EJ_GODKANDA"
T "115. Boka om till samma tid stoppas" anon "" "select kund_omboka('$TK1', ($W + interval '10 hours') at time zone 'Europe/Stockholm', '2026-11-01-v2')" "SAMMA_TID"
T "116. Boka om till måndag (stängt) stoppas" anon "" "select kund_omboka('$TK1', (($W - interval '1 day' + interval '10 hours') at time zone 'Europe/Stockholm'), '2026-11-01-v2')" "UTANFOR_OPPETTID"
T "117. Efter misslyckade försök: gamla tiden ligger kvar orörd" authenticated "$LIA" "select count(*) filter (where status='bokad')||' '||count(*) filter (where cancelled_at is not null) from bookings where confirm_token='$TK1'" "^2 0$"
T "118. Boka om till kl 13:00 samma dag: samma personer och tjänster, inte sent" anon "" "select (r->>'late')||' | '||(r->>'service_names') from (select kund_omboka('$TK1', $NY, '2026-11-01-v2')::json r) x" "^false \| Kalle: Klippning/Herrklippning 30 min; Anna: Färg och form av bryn\.$"
T "119. Gamla raderna: avbokade av kund, ombokad till 13:00, avbokningstid sparad" authenticated "$LIA" "select string_agg(status||' '||cancelled_by||' '||to_char(ombokad_till at time zone 'Europe/Stockholm','HH24:MI')||' '||(cancelled_at is not null)::text, ', ') from bookings where confirm_token='$TK1'" "^avbokad kund 13:00 true, avbokad kund 13:00 true$"
T "120. Nya raderna: 13:00–13:30 Kalle, 13:30–14:00 Anna, bekräftade, ny länk" authenticated "$LIA" "select string_agg(person_name||' '||to_char(starts_at at time zone 'Europe/Stockholm','HH24:MI')||'-'||to_char(ends_at at time zone 'Europe/Stockholm','HH24:MI')||' '||(confirmed_at is not null)::text||' '||(confirm_token <> '$TK1')::text, ', ' order by starts_at) from bookings where customer_phone='0706660001' and status='bokad'" "^Kalle 13:00-13:30 true true, Anna 13:30-14:00 true true$"
T "121. I tid: ingen sen ombokning registrerad" authenticated "$LIA" "select count(*) from uteblivna where customer_phone='0706660001'" "^0$"
T "122. Gamla länken: bokningen är ombokad" anon "" "select confirm_booking('$TK1')" "BOKNING_OMBOKAD"
TK1N=$($P -c "select confirm_token from bookings where customer_phone='0706660001' and status='bokad' limit 1")
T "123. Kunden avbokar den nya tiden i tid" anon "" "select kund_avboka('$TK1N')->>'late'" "^false$"
T "124. Avbokad av kund, ingen registrering" authenticated "$LIA" "select count(*) filter (where status='avbokad' and cancelled_by='kund')||' '||(select count(*) from uteblivna where customer_phone='0706660001') from bookings where confirm_token='$TK1N'" "^2 0$"
T "125. Länken efter avbokning" anon "" "select confirm_booking('$TK1N')" "BOKNING_AVBOKAD"
T "126. Avboka två gånger går inte" anon "" "select kund_avboka('$TK1N')" "BOKNING_AVBOKAD"
# Sena ändringar (rader läggs in direkt, nära i tid)
TK2=00000000-0000-4000-8000-0000000000d2; TK3=00000000-0000-4000-8000-0000000000d3; TK4=00000000-0000-4000-8000-0000000000d4; TK5=00000000-0000-4000-8000-0000000000d5; G5=00000000-0000-4000-8000-0000000000e5
IK() { $P -c "insert into bookings (service_ids, service_names, price, starts_at, ends_at, customer_name, customer_phone, customer_email, status, person_name, group_id, rules_version, confirm_token) values ('{$1}', 'X', $2, date_trunc('minute', $3), date_trunc('minute', $3) + interval '$4 minutes', 'Sen Kund', '0706660002', 'sen@t.se', '${7:-bokad}', ${6:-null}, ${8:-null}, '2026-11-01-v2', '$5')" >/dev/null; }
IK klipp-30 500 "now() + interval '2 hours'" 30 $TK2
IK farg-180 2500 "now() + interval '30 hours'" 180 $TK3
IK klipp-30 500 "now() - interval '10 minutes'" 30 $TK4
T "127. 2 tim kvar: länken visar sent (24 tim) men kan fortfarande ändras" anon "" "select (r->>'late')||' '||(r->>'can_change')||' '||(r->>'cancel_hours') from (select confirm_booking('$TK2') r) x" "^true true 24$"
T "128a. Sen avbokning via länken (2 tim kvar)" anon "" "select kund_avboka('$TK2')->>'late'" "^true$"
T "128b. Registreras automatiskt för Lia: sen avbokning, 1:a gången ingen avgift" authenticated "$LIA" "select kind||' '||nummer||' '||belopp||' '||status from uteblivna where customer_phone='0706660002'" "^sen_avbokning 1 0 ingen_avgift$"
T "129. Färgbehandling 30 tim kvar: 48-timmarsgränsen gäller, sent" anon "" "select (r->>'late')||' '||(r->>'cancel_hours') from (select confirm_booking('$TK3') r) x" "^true 48$"
T "130a. Sen ombokning av färgen till onsdag 09:00" anon "" "select (r->>'late')||' '||to_char((r->>'starts_at')::timestamptz at time zone 'Europe/Stockholm','HH24:MI') from (select kund_omboka('$TK3', (($W + interval '1 day 9 hours') at time zone 'Europe/Stockholm'), '2026-11-01-v2')::json r) x" "^true 09:00$"
T "130b. Registreras: sen ombokning, 2:a gången = hela priset 2500 kr" authenticated "$LIA" "select kind||' '||nummer||' '||belopp||' '||status from uteblivna where customer_phone='0706660002' order by nummer desc limit 1" "^sen_ombokning 2 2500 obetald$"
T "131. Lia kan häva (efterskänka) debiteringen" authenticated "$LIA" "select uteblivet_andra((select id from uteblivna where customer_phone='0706660002' and kind='sen_ombokning'), 'efterskankt')->>'status'" "^efterskankt$"
T "132. Tiden har börjat: kunden kan inte avboka via länken" anon "" "select kund_avboka('$TK4')" "TIDEN_HAR_BORJAT"
T "133. Tiden har börjat: kunden kan inte boka om via länken" anon "" "select kund_omboka('$TK4', $NY, '2026-11-01-v2')" "TIDEN_HAR_BORJAT"
IK klipp-30 500 "now() + interval '3 hours'" 30 $TK5 "'Kalle'" bokad "'$G5'"
IK bryn 200 "now() + interval '3 hours 30 minutes'" 30 $TK5 "'Anna'" avbokad "'$G5'"
T "134a. Grupp där Lia redan avbokat en person: kunden avbokar sent" anon "" "select kund_avboka('$TK5')->>'late'" "^true$"
T "134b. Beloppet räknar bara kvarvarande person (500 kr, inte 700); 3:e gången eftersom efterskänkt räknas" authenticated "$LIA" "select nummer||' '||belopp from uteblivna where coalesce(group_id, booking_id)='$G5'" "^3 500$"
T "135. Kund kan inte köra interna hjälpfunktioner" anon "" "select kund_timmar('$TK5'::uuid)" "permission denied"
T "136a. Lia avbokar i adminläget: sparas som avbokad av Lia" authenticated "$LIA" "update bookings set status='avbokad' where confirm_token='$TK4' returning cancelled_by" "^lia"
T "136b. Lia kan inte ändra vem som avbokade i efterhand" authenticated "$LIA" "update bookings set cancelled_by='kund' where confirm_token='$TK4'" "permission denied"
$P -c "delete from uteblivna where customer_phone like '070666%'" >/dev/null
$P -c "delete from bookings where customer_phone like '070666%'" >/dev/null

echo "--- Spärr från onlinebokning (ny 1 nov) ---"
$P -c "delete from sparrade; delete from uteblivna where customer_phone like '070444%'; delete from bookings where customer_phone like '070444%'" >/dev/null
W2="(date_trunc('week', now() at time zone 'Europe/Stockholm') + interval '16 days')"   # onsdag om 10–16 dagar
SP() { $P -c "insert into bookings (id, service_ids, service_names, price, starts_at, ends_at, customer_name, customer_phone, customer_email, status) values ('$1', '{klipp-30}', 'X', 500, date_trunc('day', now() - interval '$2 days') + interval '4 hours', date_trunc('day', now() - interval '$2 days') + interval '4 hours 30 minutes', 'Sid Spärr', '0704440001', 'sid@t.se', 'bokad'); insert into uteblivna (created_at, booking_id, customer_name, customer_phone, kind, nummer, belopp, status) values (now() - interval '$2 days', '$1', 'Sid Spärr', '0704440001', 'uteblev', 1, 0, '$3')" >/dev/null; }
SP 00000000-0000-4000-8000-0000000000f1 40 ingen_avgift
SP 00000000-0000-4000-8000-0000000000f2 30 betald
SP 00000000-0000-4000-8000-0000000000f3 20 havd
T "137. Kund kan inte spärra" anon "" "select sparra_kund('0704440001')" "permission denied"
T "138. Inloggad men INTE admin kan inte spärra" authenticated "$ANNAN" "select sparra_kund('0704440001')" "EJ_ADMIN"
T "139. 2 gånger (+ en 'kom ändå' som inte räknas) räcker inte för spärr" authenticated "$LIA" "select sparra_kund('0704440001')" "FOR_FA_GANGER"
SP 00000000-0000-4000-8000-0000000000f4 10 efterskankt
T "140. Kunden bokar en kommande tid (innan spärren)" anon "" "select create_booking('[{\"category\":\"Klippning\",\"service_ids\":[\"klipp-30\"]}]'::jsonb, (($W2 + interval '10 hours') at time zone 'Europe/Stockholm'), 'Sid Spärr', '0704440001', 'sid@t.se', '2026-11-01-v2')->>'service_names'" "^Klippning/Herrklippning 30 min$"
T "141. 3 gånger på 12 mån (även betald och efterskänkt räknas): Lia spärrar, 1 kommande tid avbokas" authenticated "$LIA" "select (r->>'ganger')||' '||(r->>'avbokade')||' '||(r->>'customer_name') from (select sparra_kund('070-444 00 01')::json r) x" "^3 1 Sid Spärr$"
T "142. Den kommande tiden: avbokad av Lia med spärrtexten" authenticated "$LIA" "select status||' '||cancelled_by||' | '||cancel_note from bookings where customer_phone='0704440001' and starts_at > now()" "^avbokad lia \| Du kan inte boka tid på nätet just nu\. Kontakta Lia på 073-642 30 18 eller kom in till salongen så löser ni det tillsammans\.$"
T "143. Spärrad kund kan inte boka (även med mellanslag i numret)" anon "" "select create_booking('[{\"category\":\"Klippning\",\"service_ids\":[\"klipp-30\"]}]'::jsonb, (($W2 + interval '13 hours') at time zone 'Europe/Stockholm'), 'Sid Spärr', '070-444 00 01', 'sid@t.se', '2026-11-01-v2')" "SPARRAD"
T "144. Spärra två gånger går inte" authenticated "$LIA" "select sparra_kund('0704440001')" "REDAN_SPARRAD"
T "145. Lia ser spärrlistan" authenticated "$LIA" "select customer_phone||' '||customer_name from sparrade" "^0704440001 Sid Spärr$"
T "146. Kund kan inte läsa spärrlistan" anon "" "select count(*) from sparrade" "permission denied"
T "147. Lia kan inte skriva direkt i spärrlistan" authenticated "$LIA" "delete from sparrade" "permission denied"
$P -c "insert into bookings (service_ids, service_names, price, starts_at, ends_at, customer_name, customer_phone, customer_email, status, rules_version, confirm_token) values ('{klipp-30}', 'X', 500, ($W2 + interval '14 hours') at time zone 'Europe/Stockholm', ($W2 + interval '14 hours 30 minutes') at time zone 'Europe/Stockholm', 'Sid Spärr', '0704440001', 'sid@t.se', 'bokad', '2026-11-01-v2', '00000000-0000-4000-8000-0000000000f9')" >/dev/null
T "148. Länken för en spärrad kund: visar sparrad = true" anon "" "select confirm_booking('00000000-0000-4000-8000-0000000000f9')->>'sparrad'" "^true$"
T "149. Spärrad kund kan inte boka om via länken" anon "" "select kund_omboka('00000000-0000-4000-8000-0000000000f9', (($W2 + interval '1 day 10 hours') at time zone 'Europe/Stockholm'), '2026-11-01-v2')" "SPARRAD"
T "150. Spärrad kund kan avboka via länken" anon "" "select kund_avboka('00000000-0000-4000-8000-0000000000f9')->>'late'" "^false$"
T "151. Inloggad men INTE admin kan inte häva" authenticated "$ANNAN" "select hav_sparr('0704440001')" "EJ_ADMIN"
T "152. Lia häver spärren" authenticated "$LIA" "select hav_sparr('0704440001')->>'customer_phone'" "^0704440001$"
T "153. Efter hävd spärr kan kunden boka igen" anon "" "select create_booking('[{\"category\":\"Klippning\",\"service_ids\":[\"klipp-30\"]}]'::jsonb, (($W2 + interval '13 hours') at time zone 'Europe/Stockholm'), 'Sid Spärr', '0704440001', 'sid@t.se', '2026-11-01-v2')->>'service_names'" "^Klippning/Herrklippning 30 min$"
T "154. Häva en kund som inte är spärrad" authenticated "$LIA" "select hav_sparr('0704440001')" "INTE_SPARRAD"
$P -c "delete from sparrade; delete from uteblivna where customer_phone like '070444%'; delete from bookings where customer_phone like '070444%'" >/dev/null

echo "--- Kontaktformuläret sparas för Lia (ny 1 nov) ---"
$P -c "delete from kontaktmeddelanden" >/dev/null
T "155. Besökare skickar meddelande" anon "" "select (skicka_meddelande('Mia Meddelande', 'mia@t.se', 'Hej! Har ni tid för slingor i december?')->>'id') is not null" "^t$"
T "156. Namn saknas" anon "" "select skicka_meddelande(' ', 'mia@t.se', 'Hej')" "OGILTIGT_NAMN"
T "157. Fel e-post" anon "" "select skicka_meddelande('Mia', 'mia.t.se', 'Hej')" "OGILTIG_EPOST"
T "158. Tomt meddelande" anon "" "select skicka_meddelande('Mia', 'mia@t.se', ' ')" "OGILTIGT_MEDDELANDE"
T "159. För långt meddelande (2001 tecken)" anon "" "select skicka_meddelande('Mia', 'mia@t.se', repeat('a', 2001))" "OGILTIGT_MEDDELANDE"
T "160. Besökare kan inte läsa meddelanden" anon "" "select count(*) from kontaktmeddelanden" "permission denied"
T "161. Besökare kan inte skriva direkt i tabellen" anon "" "insert into kontaktmeddelanden (name, email, message) values ('X Y', 'x@y.se', 'hej')" "permission denied"
T "162. Inloggad men INTE admin ser inga" authenticated "$ANNAN" "select count(*) from kontaktmeddelanden" "^0$"
T "163. Lia läser meddelandet" authenticated "$LIA" "select name||' | '||email||' | '||message from kontaktmeddelanden" "^Mia Meddelande \| mia@t.se \| Hej! Har ni tid för slingor i december\?$"
for m in Två Tre Fyra Fem; do $P -c "set role anon; select skicka_meddelande('Mia', 'MIA@t.se', '$m')" >/dev/null; done
T "164. Max 5 per e-post och timme: den 6:e stoppas (stora/små bokstäver räknas lika)" anon "" "select skicka_meddelande('Mia', 'mia@t.se', 'Sex')" "FOR_MANGA_MEDDELANDEN"
T "165. De 5 första sparades, den 6:e inte" authenticated "$LIA" "select count(*) from kontaktmeddelanden" "^5$"
$P -c "update kontaktmeddelanden set created_at = now() - interval '13 months' where message = 'Två'" >/dev/null
T "166. Rensningen tar bort meddelanden äldre än 12 månader" authenticated "$LIA" "select rensa_gamla_avbokningar() >= 0" "^t$"
T "166b. Kvar: 4 meddelanden" authenticated "$LIA" "select count(*) from kontaktmeddelanden" "^4$"
$P -c "delete from kontaktmeddelanden" >/dev/null
