P="psql -h /tmp/pg -p 5433 -U postgres -d lias -tA -q"
MON="(date_trunc('week', now() at time zone 'Europe/Stockholm') + interval '7 days')"   # nästa måndag 00:00 svensk tid
T() { # T "beskrivning" roll uid "sql" förväntat-mönster
  out=$($P -c "set role $2" -c "set request.jwt.claim.sub = '$3'" -c "$4" 2>&1 | grep -v '^CONTEXT' | tr '\n' ' ' | sed 's/ *$//')
  if echo "$out" | grep -qE "$5"; then r="OK  "; else r="FEL "; fi
  echo "$r $1  ->  $(echo "$out" | cut -c1-110)"
}
BK() { echo "select (create_booking($1, (($MON + interval '$2') at time zone 'Europe/Stockholm'), '$3', '$4', '$5'))->>'service_names'"; }
$P -c "delete from bookings; delete from admins; delete from auth.users;"
LIA=$($P -c "insert into auth.users(email) values('lia@test.se') returning id" | head -1)
ANNAN=$($P -c "insert into auth.users(email) values('annan@test.se') returning id" | head -1)
$P -c "insert into admins values ('$LIA')"

echo "--- Kund bokar ---"
T "1. Giltig bokning mån 10:00, 2 tjänster" anon "" "$(BK "array['h-kort','h-skägg']" '10 hours' 'Anna Andersson' '070-123 45 67' 'anna@test.se')" "Herr kort hår, Skäggtrim"
T "2. Krock: mån 10:15 (överlappar 10:00-10:35)" anon "" "$(BK "array['d-kort']" '10 hours 15 minutes' 'Bo B' '0701111111' 'bo@test.se')" "TIDEN_UPPTAGEN"
T "3. Direkt efter: mån 10:35 är inte på kvart" anon "" "$(BK "array['d-kort']" '10 hours 35 minutes' 'Bo B' '0701111111' 'bo@test.se')" "OGILTIG_TID"
T "4. Direkt efter: mån 10:45 (ledig)" anon "" "$(BK "array['d-kort']" '10 hours 45 minutes' 'Bo B' '0701111111' 'bo@test.se')" "Dam kort hår"
T "5. Söndag (stängt)" anon "" "$(BK "array['h-kort']" '6 days 11 hours' 'Cia C' '0702222222' 'cia@test.se')" "UTANFOR_OPPETTID"
T "6. Före öppning mån 09:45" anon "" "$(BK "array['h-kort']" '9 hours 45 minutes' 'Cia C' '0702222222' 'cia@test.se')" "UTANFOR_OPPETTID"
T "7. Slutar efter stängning mån 17:45 + 60 min" anon "" "$(BK "array['d-långt']" '17 hours 45 minutes' 'Cia C' '0702222222' 'cia@test.se')" "UTANFOR_OPPETTID"
T "8. Torsdag 19:00 (öppet till 20)" anon "" "$(BK "array['h-medel']" '3 days 19 hours' 'Cia C' '0702222222' 'cia@test.se')" "Herr medel hår"
T "9. Lördag 14:45 + 20 min (stänger 15)" anon "" "$(BK "array['h-kort']" '5 days 14 hours 45 minutes' 'Cia C' '0702222222' 'cia@test.se')" "UTANFOR_OPPETTID"
T "10. Tid i dåtid" anon "" "select create_booking(array['h-kort'], now() - interval '1 day', 'Cia C', '0702222222', 'cia@test.se')" "OGILTIG_TID"
T "11. Fel telefon (9 siffror)" anon "" "$(BK "array['h-kort']" '1 day 12 hours' 'Cia C' '070222222' 'cia@test.se')" "OGILTIGT_TELEFON"
T "12. Fel e-post" anon "" "$(BK "array['h-kort']" '1 day 12 hours' 'Cia C' '0702222222' 'cia.test.se')" "OGILTIG_EPOST"
T "13. Tomt namn" anon "" "$(BK "array['h-kort']" '1 day 12 hours' ' ' '0702222222' 'cia@test.se')" "OGILTIGT_NAMN"
T "14. Påhittad tjänst" anon "" "$(BK "array['gratis']" '1 day 12 hours' 'Cia C' '0702222222' 'cia@test.se')" "OGILTIGA_TJANSTER"
T "15. Inga tjänster" anon "" "$(BK "array[]::text[]" '1 day 12 hours' 'Cia C' '0702222222' 'cia@test.se')" "OGILTIGA_TJANSTER"
echo "--- Integritet ---"
T "16. Kund läser bokningstabellen" anon "" "select count(*) from bookings" "permission denied"
T "17. Kund ser upptagna tider (utan namn)" anon "" "select string_agg(to_char(starts_at at time zone 'Europe/Stockholm','HH24:MI')||'-'||to_char(ends_at at time zone 'Europe/Stockholm','HH24:MI'), ' ') from get_busy(($MON at time zone 'Europe/Stockholm'), ($MON + interval '1 day') at time zone 'Europe/Stockholm')" "^10:00-10:35 10:45-11:15$"
T "18. Kund försöker avboka" anon "" "update bookings set status='avbokad'" "permission denied"
T "19. Kund försöker ändra pris" anon "" "update bookings set price=0" "permission denied"
T "20. Inloggad men INTE admin läser" authenticated "$ANNAN" "select count(*) from bookings" "^0$"
T "21. Inloggad men INTE admin avbokar" authenticated "$ANNAN" "update bookings set status='avbokad' returning id" "^$|UPDATE 0"
T "22. Admin (Lia) ser alla bokningar" authenticated "$LIA" "select count(*) from bookings where status='bokad'" "^3$"
T "23. Admin får INTE ändra pris" authenticated "$LIA" "update bookings set price=0" "permission denied"
T "24. Admin avbokar mån 10:00" authenticated "$LIA" "update bookings set status='avbokad' where service_names like 'Herr kort%' returning service_names" "Herr kort hår"
T "25. Mån 10:00 är ledig igen" anon "" "$(BK "array['h-kort']" '10 hours' 'Dan D' '0703333333' 'dan@test.se')" "Herr kort hår"
T "26. Pris räknas av servern (395+149)" authenticated "$LIA" "select price from bookings where customer_name='Anna Andersson'" "^544$"
T "27. Telefon sparas utan mellanslag" authenticated "$LIA" "select customer_phone from bookings where customer_name='Anna Andersson'" "^0701234567$"
