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
- Kvar: steg 3 shop + kurser (inkl. smal-skärm-fel i produktnätet), steg 4 boka/kontakt/galleri, steg 5 slutprov. Bilder från Tommy väntas.
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
- Bokning i 3 steg: tjänst → dag/tid (14 öppna dagar, kvartstider, svensk tid oavsett telefonens tidszon) → uppgifter + Boka.
- Admin: länk "Admin" i sidfoten. Supabase-inloggning, live-lista, larm (ljud + notis) när sidan är öppen, avbokning.
- Bokningar bekräftas automatiskt. Databasen stoppar dubbelbokning (exclusion constraint) och räknar pris själv.

## Testat (allt grönt)
- SQL: 27 regeltester + samtidig dubbelbokning i riktig PostgreSQL 16.
- Supabase-läge mot simulerad Supabase → riktig PostgreSQL: 31/31.
- Demoläge frisörbokning: 20/20. Kurser + shop: 44/44. Inga nätverksanrop.
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
- Ändras pris/längd/öppettider måste det ändras både i `index.html` (`SERVICES`, `OPENING`) och i Supabase (`services`-tabellen, `create_booking`).
