P="psql -h /tmp/pg -p 5433 -U postgres -d lias -tA -q"
MON="(date_trunc('week', now() at time zone 'Europe/Stockholm') + interval '8 days')"   # testdag: nästa TISDAG 00:00 svensk tid (Lia har stängt måndagar sedan 29 okt). Namnet MON är kvar av historiska skäl.
T() { # T "beskrivning" roll uid "sql" förväntat-mönster
  out=$($P -c "set role $2" -c "set request.jwt.claim.sub = '$3'" -c "$4" 2>&1 | grep -v '^CONTEXT' | tr '\n' ' ' | sed 's/ *$//')
  if echo "$out" | grep -qE "$5"; then r="OK  "; else r="FEL "; fi
  echo "$r $1  ->  $(echo "$out" | cut -c1-110)"
}
BK() { echo "select (create_booking('$1'::jsonb, (($MON + interval '$2') at time zone 'Europe/Stockholm'), '$3', '$4', '$5'))->>'service_names'"; }
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
T "10. Tid i dåtid" anon "" "select create_booking('[{\"category\":\"Klippning\",\"service_ids\":[\"klipp-30\"]}]'::jsonb, now() - interval '1 day', 'Cia C', '0702222222', 'cia@test.se')" "OGILTIG_TID"
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
T "40. Pris och tid från servern, inte webbsidan (Permanent kort = 1650 kr, 120 min)" anon "" "select (r->>'price')||' '||(r->>'duration') from (select create_booking('[{\"category\":\"Permanent\",\"service_ids\":[\"perm-kort\"],\"price\":1}]'::jsonb, (($MON + interval '2 days 14 hours') at time zone 'Europe/Stockholm'), 'Pia P', '0706666666', 'pia@test.se') r) x" "^1650 120$"
T "41. Kunden kan inte läsa förnamnen via get_busy" anon "" "select count(*) from get_busy(now(), now() + interval '14 days') g where row_to_json(g)::text like '%Kalle%'" "^0$"
T "42. Torsdag 09:00, första tiden (öppnar 09)" anon "" "$(BK "$(P Klippning '"klipp-30"')" '2 days 9 hours' 'Gun G' '0707777777' 'gun@test.se')" "^Klippning/Herrklippning 30 min$"
T "43. Söndag 11:00 (stängt)" anon "" "$(BK "$(P Klippning '"klipp-30"')" '5 days 11 hours' 'Gun G' '0707777777' 'gun@test.se')" "UTANFOR_OPPETTID"

echo "--- Lias tjänster (ny 29 okt) ---"
T "44. Längsta tjänsten (Färgbehandling 3 h) fre 13:00–16:00 går att boka" anon "" "$(BK "$(P Färgbehandling '"farg-180"')" '3 days 13 hours' 'Hans H' '0708888888' 'hans@test.se')" "^Färgbehandling 3 timmar, klippning ingår\.$"
T "45. Färgbehandling 3 h tis 14:15 slutar 17:15 (efter stängning)" anon "" "$(BK "$(P Färgbehandling '"farg-180"')" '14 hours 15 minutes' 'Hans H' '0708888888' 'hans@test.se')" "UTANFOR_OPPETTID"
T "46. Gamla kategorin Herr finns inte längre" anon "" "$(BK "$(P Herr '"klipp-30"')" '2 days 11 hours' 'Hans H' '0708888888' 'hans@test.se')" "OGILTIGA_TJANSTER"
T "47. Alla 17 tjänster finns i databasen, i 6 kategorier" anon "" "select count(*)||' '||count(distinct category) from services" "^17 6$"

echo "--- Avbokningsmeddelande (ny 30 okt) ---"
T "48. Admin sparar ett meddelande vid avbokning" authenticated "$LIA" "update bookings set status='avbokad', cancel_note='Din frisör Lia är tyvärr sjuk och måste avboka din tid.' where id=(select id from bookings order by starts_at limit 1) returning cancel_note" "^Din frisör Lia är tyvärr sjuk och måste avboka din tid\.$"
T "49. Meddelande längre än 160 tecken stoppas" authenticated "$LIA" "update bookings set cancel_note=repeat('x',161) where id=(select id from bookings order by starts_at limit 1)" "cancel_note_langd"
T "50. Inloggad men INTE admin kan inte skriva meddelande" authenticated "$ANNAN" "update bookings set cancel_note='hej' returning id" "^$|UPDATE 0"
T "51. Kund (ej inloggad) kan inte skriva meddelande" anon "" "update bookings set cancel_note='hej'" "permission denied"
T "52. Admin får fortfarande INTE ändra pris" authenticated "$LIA" "update bookings set price=0" "permission denied"
