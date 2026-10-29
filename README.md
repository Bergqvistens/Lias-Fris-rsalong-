# Lias Hantverkeri

Webbplats för Lias Hantverkeri – frisörsalong och keramikverkstad i Karlskoga.

## Innehåll
- Start
- Boka (frisörtjänster)
- Kurser (keramik)
- Shop (keramikprodukter)
- Galleri
- Kontakt

## Teknik
- `index.html` – hela webbplatsen, BYGGD från källfilen. React 18 (cdnjs) och supabase-js 2 (jsdelivr). Appens kod är översatt i förväg (ingen Babel i webbläsaren), så ändra inte appkoden direkt i `index.html`.
- `kalla/app-kalla.html` – källfilen (läsbar JSX). Gör ändringar här och bygg om: `node verktyg/bygg.js kalla/app-kalla.html index.html` (kräver Node och esbuild).
- `verktyg/bygg.js` – byggskriptet.
- `bilder/` – alla foton (WebP/JPG). Måste ligga i mappen `bilder` bredvid `index.html`. Ny bild: lägg filen i `bilder/` och ange sökvägen i `window.LH_IMG` i källfilen och bygg om.
- `supabase-setup.sql` – databas, regler och bokningsfunktioner för Supabase.
- `INSTALLATION.md` – checklista för att koppla in Supabase.
- `REDOVISNING.md` – slutredovisning av ombyggnaden (26 okt 2026).
- `tester/` – automatiska tester och instruktion (`tester/LASMIG.md`).

## Bokning
Kunden bokar i tre steg, för 1–4 personer (en tjänst per person bland Lias 17 tjänster i 6 kategorier, med "från"-pris och en "Mer info"-ruta med Lias beskrivning; listan finns i kalla/tjanster-lia.md). Personerna får tider efter varandra eftersom Lia är ensam frisör. Bokningen sparas direkt i Supabase och är bokad; databasen stoppar dubbelbokningar. Lia ser nya bokningar direkt i admin-sidan med ljud och notis.

## Demoläge
Så länge Supabase inte är inkopplat körs sidan i demoläge (gul skylt högst upp). Allt går att prova – frisörbokning, kursbokning och köp i shopen – men sparas bara i den egna webbläsaren. Inga bokningar, betalningar eller sms görs; sms:en visas i stället på skärmen. Kursdatum, redan bokade kursplatser och lagersaldo är exempel. Admin i demo: lia@demo.se / demo1234. När Supabase är inkopplat kan demoläget öppnas med `?demo=1` i adressen.
