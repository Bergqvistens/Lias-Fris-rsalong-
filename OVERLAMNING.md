# Överlämning – Lias Hantverkeri (25 okt 2026, uppdaterad)

## Filer (i GitHub-repot)
- `index.html` – hela webbplatsen (React 18 via CDN, supabase-js 2.45.4, ~160 KB). Loggan i headern och två små ikoner är inbäddade, allt annat ligger i `bilder/`.
- `bilder/` – 19 bildfiler (16 WebP i `window.LH_IMG`, galleri-lia-1/2.jpg = Lias egna foton i `IMAGES`, ikon-192.png). **Måste laddas upp till GitHub tillsammans med index.html.**
- `supabase-setup.sql` – databas, regler, `create_booking`, `get_busy`, `is_admin`, realtime
- `INSTALLATION.md` – checklista för att koppla in Supabase
- `README.md`
- Appikon (separat): `lias-ikon.svg` (vektor), `lias-ikon-1024-appstore.png` (kvadratisk, utan alfa), `lias-ikon-1024-rundad.png`. Inbäddad i index.html som flikikon (32, 192) och apple-touch-icon (180).

## Ombyggnad enligt uppdraget (pågår)
- **Steg 1 klart (26 okt):** designtokens (CSS-variabler i <head> + objektet `T` i JS), Lucide-ikoner inbäddade (`ICONS`, ISC-licens, från react-icons 5.7.0), komponenterna AppHeader, BottomNavigation, Card, Button, IconButton, FilterChip, StatusBadge, FormField, ResponsiveImage, EmptyState, LoadingState, ErrorState, kompakt DemoBanner. Logga nr 6 i header + flik/hemskärmsikon. Typsnitt Fraunces (rubriker) + Inter (text) via Google Fonts.
- Terrakotta #C76B4F för ikoner/ramar; text i terrakotta använder #9C4B33 (kontrast ≥ 4,5:1). Turkos #5FA8A8 bara dekor (vit text på turkos 2,7:1).
- **Steg 2 klart (26 okt):** turkos tema (header/meny #2F6F70, sidbakgrund #5FA8A8, text på turkos #173026). Ny logga (LH i sexkant med fågel, från Tommys förlaga – bara ~105 px, be om originalfil). Ny startsida: hero med "Välkommen till Lias Hantverkeri", tre ingångar med bild. Sidor som inte byggts om har kvar gammal bakgrund (`REBUILT` i App).
- **Bilder (26 okt):** 8 WebP i `window.LH_IMG` (eget <script> före Babel); kartläggs i `IMG` och `PRODUCT_IMG`. salong-miljo (hero), frisor-detalj (Boka-ingång), keramik-drejning (Kurser-ingång + kurssida), produkt-kopp/skal/kruka/presentset (shop), keramikverkstad-miljo (överst på Kontakt + galleri i steg 4). Kopp, skål, kruka, presentset (600 px) och verkstad (960 px) bytta till högupplösta bilder 26 okt. Tallrik och vas (produkt-tallrik, produkt-vas, 600 px) inlagda 26 okt; ny presentlådebild (blå olivmönster) 26 okt – alla sex produkter har bild. **Nya 26 okt:** banner-boka (överst i bokningens steg 1), banner-kontakt (överst på Kontakt, ersätter verkstadsbilden där), banner-galleri (överst i Galleri), galleri-herrklipp, galleri-barnklipp, galleri-styling (galleribild 3–5, märkta Inspirationsbild). Bannrarna har text i bilden – alt-texten innehåller samma text. Visas hela i 3:2. keramikverkstad-miljo används just nu inte. Tommys bild med text/knappar i bilden används inte (text i bild).
- **Steg 3 klart (26 okt):** Shop: filter Alla/Koppar/Skålar/Krukor/Present/Dekoration (vas + tallrik = Dekoration), produktnät 1 kolumn ≤ ~330 px annars 2+, kort med bild/namn/pris/lagermärke (I lager / Endast N kvar vid ≤ 2 / Slut i lager), produktdialog (Escape, fokusfälla, fokus tillbaka), kassan visar bilder. Servis set → **Presentlådan** ("Handgjord mugg, kopp och skål med kökshandduk i presentlåda. Perfekt gåva!", 899 kr). Kurser: filter Alla kurser/Nybörjare/Fortsättning/Barn/Drop-in, kurskort med linjeikoner, nästa möjliga start, Platser kvar / Få platser kvar (≤ 2) / Fullbokad (knapp avstängd "Fullbokad"). Sidorna courses + shop i `REBUILT` (turkos). Flödestexter använder CSS-variablerna --flow-fg / --flow-err / --bar-bg.
- Ej byggt i steg 3 (behöver beslut/backend): "Ställ dig i kö", "Meddela mig", status "Kommande" och "Anmälan stängd" (det finns ingen data för dem). Kassan och kursens bokningssteg har kvar gammal stil (bruna ramar, emojis i sammanfattningar) – tas i steg 4/5.
- **Steg 4 klart (26 okt):** Alla kundsidor i ny design (`REBUILT` = home, booking, courses, shop, contact, gallery). Boka: stegräknare + stapel, kategorier Herr/Dam/Barn med inspirationsbild (CAT_IMG), valbara kort (aria-pressed, bock, "Vald", tjockare ram), sammanfattning, dag/tid med aria-pressed. Kurs- och kassaflöden: samma byggstenar (StepTitle, InfoRow, DoneCard, ContactFields via FormField), inga emojis. Fortsätt-knapp champagne på mörk turkos; Betala-knappen behåller rosmaringrönt (Tommys val). Kontakt: kort med ikoner, `CONTACT`-konstant (tel: null tills riktigt nummer finns → ingen ring-länk), mailto, öppettider som tabell från `OPENING` med "(idag)", formulär med etiketter/fel/laddning/bekräftelse (demo simulerar; utan demo öppnas e-postprogrammet via mailto). Galleri: filter Alla/Frisör/Keramik/Workshop, "Från Lias salong" (egna) separat från "Inspirationsbilder" (AI), ljuslåda med pilar/Escape/fokusfälla, Boka tid-knapp.
- Admin är **inte** omgjord (gammal stil). Planerat steg 6: bilduppladdning, ekonomiöversikt, kvittosök, export; Fortnox senare (kräver Supabase + server).
- **Steg 5 klart (26 okt):** slutprov s5check.js 45/45 (felstatus, laddning, rubriker, alt, tangentbord, tryckytor, prestanda, Supabase-läge). Rättat: kurser/shop visar fel + Försök igen i stället för evig laddning/tyst fel, kortrubriker h2, Admin-länk 44 px, aktiv menyetikett vid ≤ 340 px. Redovisning i `REDOVISNING.md`. Testerna sparade i `tester/` (464 kontroller, alla gröna) med testdatabas (`lokal-testdatabas.sql`, kontrollerad: 27/27).
- **Steg 6 klart (26 okt, endast demoläge):** Admin har flikarna Bokningar / Ekonomi / Bilder (admin nu i `REBUILT`, mörk text på turkos). **Ekonomi:** idag + senaste 24 h, "Registrera betalning på plats" för frisör- och kursbesök (senaste 7 dagarna + idag, ej betalda) → kvitto K-1001…, betalningar senaste dygnet, inkomst per dag (14 dagar), sök kvitto (nummer/namn/telefon) med kvittovy, CSV-export per månad (BOM, semikolon). Shopbeställningar räknas som betalningar (LH-xxxx). Text: översikt, inte bokföring/kassaregister. **Bilder:** uppladdning förminskas i webbläsaren (max 1000 px, JPEG), bildtext, kategori, kryss "Kunden har godkänt" krävs, max 12 i demo (localStorage), ta bort; visas först under "Från Lias salong" i galleriet. Demo-RPC: get_payments, mark_paid, get_photos, add_photo, delete_photo. **Supabase-läge:** flikarna visar att det inte är byggt (tabeller payments/photos + Storage saknas). Test: s6check.js 52/52.
- **Tillbaka i rutor (27 okt, Tommys önskemål):** produktrutan, galleriets bildvisning och kvittorutan har en fast list överst med "Tillbaka" + X som syns även när man scrollar (`DialogBar`), produkt och kvitto har även Tillbaka längst ner. Telefonens bakåtknapp/svep stänger rutan (`useBackClose`: history.pushState + popstate). Produktrutans maxhöjd är nu calc(100% - 24px) (förut 92vh, som vid förstorad text gjorde att toppen hamnade utanför skärmen). Test tillbaka.js 40/40.
- Nästa möjliga: Supabase-tabeller för kurs/shop/betalningar/bilder, riktig betalning, Fortnox (kräver server), typsnitt lokalt (GDPR), riktiga kontaktuppgifter.
- Bekräftat av Tommy: logga nr 6; Färgning dam 449 kr stämmer (ändras senare).

## Publicering
- GitHub-repo: **Bergqvistens/Lias-Fris-rsalong-** (Claude-appen har åtkomst). GitHub Pages: main, / (root).
- Adress: https://bergqvistens.github.io/Lias-Fris-rsalong-/ (bekräftad fungerande av Tommy 26 okt).
- Lias-Place har en äldre index.html och används inte (Claude saknar åtkomst dit).

## Läge just nu
- **Demoläge är på** (Supabase ej inkopplat). Hela bokningen fungerar lokalt i webbläsaren, inga bokningar/sms skickas. Demo-admin: `lia@demo.se` / `demo1234`. `?demo=1` tvingar demoläge.
- **Kurser (demo):** välj kurs → omgång (3 kommande omgångar, drop-in 8 tillfällen; exempeldatum) + antal platser 1–4 → uppgifter → boka. Fulla omgångar spärras. Lia kan avboka.
- **Shop (demo):** varukorg (sparas i sessionStorage) → kassa → simulerad Swish/kort → kvitto med ordernummer LH-xxxx. Hämtas i butik. Lagersaldo är exempel. Lia markerar "Klar att hämta" (sms) → "Hämtad".
- I Supabase-läge visar kurser och shop "öppnar snart" – SQL för kurser/beställningar är **inte** byggd än.
- Tryck på en menyknapp startar alltid om den sidan (main har key).
- **Samtidiga bokningar (27 okt):** `create_booking` tar `pg_advisory_xact_lock` innan raderna sparas – annars kunde två samtidiga grupper ge "deadlock detected" (aldrig dubbelbokning, men fel besked). Appen tolkar ändå "deadlock" som TIDEN_UPPTAGEN. Kontrollerat: främlingar kan inte gå in i andras grupp (group_id skapas av servern), inte läsa/ändra/radera bokningar, get_busy visar bara tider. Test krock-parallell.sh 20/20 (×5).
- **Lias schema i admin (27 okt):** kort med "Klippning: [förnamn eller kundnamn] HH:MM–HH:MM" och läge **Pågår nu** (grön), **Kommande** (beige), **Klar** (grå) med text + ikon; dagens klara ligger kvar (listan hämtar från dagens början), Avboka döljs på klara, läget uppdateras var 30:e sekund. Test schema-test.js 11/11.
- **Appen öppnas alltid på startsidan** (26 okt): `lias_v1` sparar bara `{gdprOk}`, inte senaste flik. **Varje flik börjar längst upp:** App scrollar till toppen när `tab`/`nav` ändras, och `history.scrollRestoration = manual`. Test: start-topp.js 16/16.
- Bokning i 3 steg: personer och klippning → dag/tid (14 öppna dagar, kvartstider, svensk tid oavsett telefonens tidszon) → uppgifter + Boka.
- **Flera personer (27 okt, Tommys beslut):** 1–4 personer per bokning. Varje person: kategori Herr/Dam/Barn, **exakt en klippning** (kort/medel/långt eller barnklippning) + valfria tillägg i samma kategori. Förnamn krävs för varje person när fler än en bokas. **En frisör:** personerna läggs efter varandra från vald starttid; bara starttider där hela kedjan är ledig och slutar före stängning visas. Databasen (`create_booking(p_people jsonb, …)`) gör samma kontroller och sparar en rad per person (`person_name`, `group_id`) – allt eller inget. Tjänster har `category` + `kind` (klipp/tillagg) i SQL och `cat` + `cut` i index.html. Lia ser ett kort per person ("Klipps: Kalle") och kan avboka/registrera betalning per person.
- Admin: länk "Admin" i sidfoten. Supabase-inloggning, live-lista, larm (ljud + notis) när sidan är öppen, avbokning.
- Bokningar bekräftas automatiskt. Databasen stoppar dubbelbokning (exclusion constraint) och räknar pris själv.

## Testat (allt grönt)
- SQL: 41 regeltester (varav 14 för flera personer) + samtidig dubbelbokning i riktig PostgreSQL 16.
- Supabase-läge mot simulerad Supabase → riktig PostgreSQL: 31/31.
- Demoläge frisörbokning: 20/20. Kurser + shop: 44/44. Steg 3-design: 88/88 (s3check.js). Steg 4: 81/81 (s4check.js). Menyetiketter med varje flik aktiv: 24/24 (nav-alla.js). Inga nätverksanrop.
- Ej testat: koppling till Supabases riktiga servrar (ingen internetåtkomst i testmiljön).

## Nästa steg
0. Byt exempel mot riktiga uppgifter: kursstartdatum, lagersaldo, Lias telefon/e-post.
1. Tommy: skapa Supabase-projekt enligt `INSTALLATION.md` och skicka Project URL + anon public key → läggs in i `index.html` (`KLISTRA_IN_PROJECT_URL`, `KLISTRA_IN_ANON_PUBLIC_KEY`).
2. Tommy kollar SMS-leverantör. Rekommendation från utredningen: **46elks** (52 öre/sms exkl. moms, avsändare `LiasSalong`).
3. Bygga: Edge Function `send-sms` + Database Webhook (bekräftelse, avbokning, sms till Lia), därefter påminnelse 24 h före via Supabase Cron + omförsök.
4. Lägga till GDPR-text under bokningsformuläret (förslag finns i utredningen).
5. Bygga Supabase-tabeller och funktioner för kursbokningar och beställningar (motsvarande demons `book_course`, `get_course_seats`, `place_order`, `get_stock`), samt riktig betalning (Swish Handel eller kortleverantör).

## Kända begränsningar
- **Bilder ligger som filer i `bilder/` sedan 26 okt** (tidigare inbäddade; vid 2 000 004 byte visade Claude-appens förhandsvisning bara turkos skärm). Förhandsvisningen i chatten visar därför "Bild kommer" i stället för bilder; på GitHub Pages syns de. Bannrar och galleribilder är WebP kvalitet 80.
- Larmet hos Lia hörs bara när admin-sidan är öppen; "Slå på larm" måste tryckas varje gång (webbläsarregel). Lös med sms/Pushover enligt steg 3.
- Ändras pris/längd/öppettider måste det ändras både i `index.html` (`SERVICES` med cat/cut, `OPENING`) och i Supabase (`services`-tabellen med category/kind, `create_booking`).
