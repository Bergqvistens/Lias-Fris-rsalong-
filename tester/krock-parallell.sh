# Två olika kunder bokar exakt samtidigt (parallella anslutningar) med överlappande tider.
# Förväntat: exakt en lyckas varje gång, och det finns aldrig överlapp i tabellen.
P="psql -h /tmp/pg -p 5433 -U postgres -d lias -tA -q"
DAG="(date_trunc('week', now() at time zone 'Europe/Stockholm') + interval '8 days')"   # tisdag nästa vecka
pass=0; fail=0
boka() { # $1 personer-json  $2 starttid  $3 kundnamn
  $P -c "set role anon" -c "select create_booking('$1'::jsonb, (($DAG + interval '$2') at time zone 'Europe/Stockholm'), '$3', '0701234567', 'x@y.se')->>'service_names'" 2>&1 | grep -oE "TIDEN_UPPTAGEN|ERROR.*|[A-Za-zåäö].*" | head -1
}
GRUPP='[{"category":"Klippning","service_ids":["klipp-30"],"name":"Kalle"},{"category":"Frans och/eller brynfärg","service_ids":["bryn"],"name":"Anna"},{"category":"Styling, tvätt & föning","service_ids":["tvatt-fon"],"name":"Lisa"}]'   # 12:00–13:30 (30+30+30 min)
EN='[{"category":"Klippning","service_ids":["klipp-lyx"]}]'   # 60 min
for runda in $(seq 1 20); do
  $P -c "delete from bookings"
  # Runda udda: gruppen 12:00–13:30 mot enskild 12:30–13:30 (mitt i Annas tid). Jämna: samma starttid 12:00.
  if [ $((runda % 2)) -eq 1 ]; then T2='12 hours 30 minutes'; else T2='12 hours'; fi
  boka "$GRUPP" '12 hours' "Familjen Ek" > /tmp/t/kA.txt &
  boka "$EN" "$T2" "Okänd Person" > /tmp/t/kB.txt &
  wait
  A=$(cat /tmp/t/kA.txt); B=$(cat /tmp/t/kB.txt)
  # Bara en riktig bokning räknas som lyckad (felmeddelanden räknas inte); förloraren ska få TIDEN_UPPTAGEN
  ok_count=$(( $(grep -cE "Kalle: Klippning|^Klippning lyx$" /tmp/t/kA.txt) + $(grep -cE "Kalle: Klippning|^Klippning lyx$" /tmp/t/kB.txt) ))
  lost=$(( $(grep -c TIDEN_UPPTAGEN /tmp/t/kA.txt) + $(grep -c TIDEN_UPPTAGEN /tmp/t/kB.txt) ))
  overlap=$($P -c "select count(*) from bookings a join bookings b on a.id < b.id and a.status='bokad' and b.status='bokad' and tstzrange(a.starts_at,a.ends_at) && tstzrange(b.starts_at,b.ends_at)")
  rows=$($P -c "select count(*) from bookings")
  if [ "$ok_count" -eq 1 ] && [ "$lost" -eq 1 ] && [ "$overlap" -eq 0 ]; then pass=$((pass+1)); r=OK; else fail=$((fail+1)); r=FEL; fi
  echo "$r  runda $runda: grupp -> ${A:0:40} | enskild -> ${B:0:30} | rader $rows, överlapp $overlap"
done
echo "RESULTAT: $pass OK, $fail FEL"
