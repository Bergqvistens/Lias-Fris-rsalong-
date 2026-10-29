# Tester för Lias Hantverkeri

Testerna kördes i Claudes testmiljö (Linux med Node 22, Playwright/Chromium, esbuild och PostgreSQL 16). De är sparade här så att de kan köras igen efter att miljön har nollställts. Sökvägarna i filerna förutsätter mappen `/tmp/t`.

## Förberedelse
1. Kopiera alla filer i den här mappen till `/tmp/t`.
2. Bygg React-paketet för testerna (React 19 + react-dom/client):
   `NODE_PATH=/opt/npm-tools/node_modules esbuild /tmp/t/shim.js --bundle --minify --define:process.env.NODE_ENV='"production"' --outfile=/tmp/t/react-shim.js`
   (`NODE_PATH` ska peka på mappen där react och react-dom finns. Kontrollerat 26 okt: ger samma fil, 193 256 byte, som testerna kördes med.)
3. Bygg först index.html från källfilen: `node verktyg/bygg.js kalla/app-kalla.html index.html`. Bygg sedan testsidan (efter varje ändring):
   `node /tmp/t/test.js <sökväg till index.html>`
   Den kontrollerar också syntax, bildskriptet och att alla bildfiler i `bilder/` finns. Är index.html byggd (`<script id="lh-app">`) kör testerna exakt den koden; Babel får inte finnas kvar.
Obs: en hel körning av alla sviter tar mer än 10 minuter (startbilden 3,5 s vid varje start) – kör dem i omgångar.
4. För `scenario.js`, `grupp-test.js`, `s5check.js`, `s6check.js` (Supabase-delen) `sqltest.sh` och `krock-parallell.sh`: starta PostgreSQL 16 på port 5433 (socket `/tmp/pg`), skapa databasen `lias` och läs in `lokal-testdatabas.sql`. Filen skapar rollerna anon/authenticated, en enkel ersättning för Supabases `auth`-schema samt tabeller, regler och funktioner från `supabase-setup.sql`.

Testerna läser bilderna från `/mnt/user-data/outputs/github/bilder/` – ändra sökvägen i filerna om mappen ligger någon annanstans.

## Testsviter (resultat 27 okt 2026, alla gröna)
| Fil | Vad | Resultat |
|---|---|---|
| `sqltest.sh` | Databasregler: bokningsregler, dubbelbokning, behörigheter, flera personer (en klippning per person, förnamn, max 4, efter varandra, allt-eller-inget) (testdag tisdag; öppettider tis–fre 9–17, mån/lör/sön stängt för onlinebokning) | 43/43 |
| `krock-parallell.sh` | Två olika kunder bokar exakt samtidigt (grupp mot enskild, överlappande) – exakt en lyckas, aldrig överlapp, förloraren får TIDEN_UPPTAGEN | 20/20 |
| `scenario.js` (+ `e2e.js`, `mock-supabase.js`) | Supabase-läge mot riktig PostgreSQL: kund bokar, Lia får larm, krock, avbokning | 31/31 |
| `grupp-test.js` | Flerpersonsbokning i demo och mot riktig PostgreSQL: en klippning + tillägg, kategoribyte, förnamn, max 4, kedjan måste vara ledig, tider i följd, bekräftelse/sms, admin per person | 34/34 |
| `schema-test.js` | Lias schema: "Klippning: namn tid", Pågår nu / Kommande / Klar (färg + text), dagens klara kvar, byter läge av sig själv (styrd klocka), kontrast | 11/11 |
| `demo-scenario.js` | Demoläge: frisörbokning, sms-logg, krock, avbokning, nollställ | 20/20 |
| `kurs-shop.js` | Demoläge: kursbokning, platser, köp, lager, kvitto, Lias admin | 44/44 |
| `s1check.js` | Steg 1: tokens, komponenter, header, meny, 320–430 px, 130 % text | 51/51 |
| `s2check.js` | Steg 2: startsidan | 16/16 |
| `s3check.js` | Steg 3: shop och kurser (filter, lager, dialog, kontrast, bredder) | 88/88 |
| `s4check.js` | Steg 4: boka, kontakt, galleri, kassa, kursflöde | 81/81 |
| `s5check.js` | Steg 5: felstatus, laddning, rubriker, alt-texter, tangentbord, tryckytor, prestanda (startsidans bilder först, övriga i bakgrunden – ändrat 27 okt), Supabase-läge | 45/45 |
| `s6check.js` | Steg 6: admin – ekonomi (betalning på plats, kvittosök, CSV-export), bilder (förminskning, godkännande, galleri), larm på ekonomifliken, Supabase-läge | 52/52 |
| `tillbaka.js` | Tillbaka överst och längst ner syns efter scroll i produktruta, bildvisning och kvitto; telefonens bakåtknapp stänger rutan (320×568, 390, 430, 130 % text) | 40/40 |
| `fade-test.js` | Sidfoten: mjuk övergång från sidans turkos till brunt utan glapp, text bara på brun yta, kontrast ≥ 4,5 (alla sidor, 320/390/430, 130 % text) | 29/29 |
| `skarmar.js` | Alla 6 sidor på 13 skärmstorlekar (320×568 … 430×932, liggande mobil, surfplatta, dator): ingen sidledsscroll, ingen avklippt text, menyn täcker inte, minst 200 px synligt innehåll | 13/13 |
| `vrid.js` | Vrid mobilen till liggande: knappfältet följer menyn, 283 px synligt (förut 193), tryckytor ≥ 44 px; dator: menyn i mitten | 3/3 |
| `nav-alla.js` | Menyetiketter klipps inte, med varje flik aktiv | 24/24 |
| `b4check.js` | Bannerbilder och galleribilder laddas och visas hela | 21/21 |
| `start-topp.js` | Appen startar på startsidan, varje flik börjar längst upp | 16/16 |
| `sms-ruta.js` | Sms-rutorna i admin: tonad sandbakgrund i stället för vitt, brun ram 2 px, rubrikrad och text kontrast ≥ 4,5, text 15/13 px, 12 px luft (390, 320, 130 % text) | 33/33 |
| `cookie-glimt.js` | Cookie-rutan: visas och står kvar första gången; efter godkännande syns den aldrig vid omstart (inte ens en glimt, 3 omstarter); trasig/tom/"inte godkänt" sparad uppgift och blockerad lagring visar rutan utan krasch. Gamla versionen gav 8 FEL i samma test | 20/20 |
| `bild-direkt.js` | Flikbyte: alla synliga bilder klara samtidigt inom 250 ms och ingen bild hämtas vid tryck (egen webbserver med cache och 600 ms fördröjning per bild). Gamla versionen: 8 FEL, bilder kom efter upp till 0,7 s | 11/11 |
| `startbild.js` | Startbilden (Lias originallogga i champagne, skogsgrön #0E2619): syns efter 0,7 s fast typsnitt tar 4 s och appen 3 s, får plats på 390, 320 och liggande, loggan skarp vid 3× pixeltäthet, kontrast 7,24, försvinner när appen är klar, "tar längre tid"-text efter 15 s utan nät, ingen pulsering vid minskad rörelse; syns minst 3,5 s (börjar tona vid 3,50 s, toning ca 0,4 s, ingen toning vid minskad rörelse), ingen extra väntan när appen laddar längre, visas aldrig vid flikbyte | 41/41 |
| `starttid.js` | Mätning (inte godkänt/underkänt): tid tills appen är ritad, processorn 4× långsammare, ingen nätfördröjning. 27 okt: median 0,42 s | – |
| `kontakt-info.js` | Lias riktiga uppgifter: telefon 073-642 30 18 med ring-länk, lias.hantverkeri@gmail.com, Sandviksvägen 10, öppettider i tabellen, bokning bara tis–fre 09–17, inga gamla platshållare kvar | 10/10 |
| `ram-test.js` | Brun ram 1 px (#91744A) på alla innehållsrutor (.lh-card, .lh-entry) på fem sidor, mätt som mobilskärm 3×; knappar, menyn och inmatningsfält oförändrade | 8/8 |
| `b2check.js` | Produktbilder i shop och startsida | inga fel |

Totalt 805 kontroller (27 okt 2026). s6check.js behöver också `/tmp/t/ingenbild.txt` (finns här) och `/tmp/t/storbild.jpg`, som skapas med Python/Pillow:
`python3 -c "from PIL import Image; n=Image.effect_noise((4000,3000),60).convert('RGB'); g=Image.linear_gradient('L').resize((4000,3000)).convert('RGB'); Image.blend(n,g,0.5).save('/tmp/t/storbild.jpg',quality=92)"`. Ej testat: riktiga Supabase-servrar, riktig betalning, riktiga sms, iPhone/Safari (testerna kör Chromium).
