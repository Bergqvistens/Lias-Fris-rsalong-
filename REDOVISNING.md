# Redovisning – ombyggnad av Lias Hantverkeri-appen

Datum: 26 oktober 2026. Uppdraget genomfört i fem steg (avsnitt 17): tokens och komponenter, startsida och navigation, shop och kurser, boka/kontakt/galleri, slutprov. Publicerad på https://bergqvistens.github.io/Lias-Fris-rsalong-/ (repo Bergqvistens/Lias-Fris-rsalong-).

## 1. Ändrade filer
| Fil | Ändring |
|---|---|
| `index.html` | Hela appen (en fil, ca 180 KB). Ny design på alla kundsidor: Start, Boka, Kurser, Shop, Kontakt, Galleri. Bokningslogik, priser, tider och kursuppgifter är oförändrade. |
| `bilder/` (ny) | 19 bildfiler (WebP och JPG). Tidigare låg bilderna inbakade i index.html. |
| `README.md`, `OVERLAMNING.md` | Uppdaterade med bildmapp, design och status. |
| `tester/` (ny) | Alla testsviter, en exporterad testdatabas och en instruktion (`tester/LASMIG.md`). |
| `REDOVISNING.md` (ny) | Det här dokumentet. |
| `supabase-setup.sql`, `INSTALLATION.md` | Oförändrade. Ingen ändring av datalagring eller backend. |

## 2. Nya komponenter
**Grund**
- Designtokens: CSS-variabler i `<head>` och JS-objektet `T`, med färger, typsnitt, avstånd, radier, skuggor, brytpunkter, z-index och safe-area.
- `Icon` med ikonsamlingen `ICONS`.

**Gemensamma komponenter**
- `AppHeader`, `BottomNavigation`, `Card`, `Button`, `IconButton`, `FilterChip`, `StatusBadge`, `FormField` och `ResponsiveImage`.
- `EmptyState`, `LoadingState` och `ErrorState`.

**Komponenter för flöden**
- `StepTitle` (stegräknare med stapel), `InfoRow` (rad med ikon), `DoneCard` (bekräftelse), `ContactFields` (namn, mobil, e-post) och `ActionBar` (fast knapp ovanför menyn).
- Kompakt `DemoBanner`.

**Sidspecifikt**
- Startsida med hero och tre ingångar.
- Produktdialog i shoppen.
- Ljuslåda i galleriet.
- Kurskort med status och nästa möjliga start.

**Datakonstanter**
- `IMG`, `PRODUCT_IMG`, `CAT_IMG`, `GALLERY`, `CONTACT`, `COURSE_CATS` och `SHOP_CATS`.

## 3. Installerade paket
- **Inga nya paket i appen.** Den använder fortfarande React 18 och Babel från cdnjs samt supabase-js från jsdelivr.
- **Ikoner:** linjeikoner från Lucide (ISC-licens), kopierade som SVG-kod från react-icons 5.7.0. Inget ikonpaket laddas.
- **Typsnitt:** Fraunces för rubriker och Inter för text, båda från Google Fonts.
- **Endast i testmiljön:** Playwright/Chromium, esbuild, React 19 och PostgreSQL 16.

## 4. Antaganden
**Avvikelser som ägaren valt**
- **Färgtema:** Tommy valde turkos sidbakgrund i stället för uppdragets skogsgröna och champagnefärgade huvudstil. Header och meny har djup turkos (#2F6F70), sidbakgrunden är turkos (#5FA8A8) och text direkt på turkos är mörk (#173026).
- **Logga:** den nya loggan (LH i sexkant med fågel) används, enligt Tommys val.

**Status och gränsvärden**
- "Få platser kvar" och "Endast N kvar" visas vid 2 eller färre.
- Kursstatus beräknas från de kommande omgångarna. "Nästa start" är den första omgången med lediga platser.
- Statusarna "Kommande" och "Anmälan stängd" finns inte, eftersom det saknas uppgifter för dem.
- Kategorier i shoppen:
  - Kopp → Koppar
  - Skål → Skålar
  - Kruka → Krukor
  - Presentlådan → Present
  - Vas och tallrik → Dekoration (bekräftat av Tommy)
- Servis set heter nu **Presentlådan**, med ny beskrivning. Namnet och beskrivningen är bekräftade av Tommy och priset 899 kr är oförändrat.

**Bilder**
- AI-genererade bilder märks "Inspirationsbild" och visas skilda från Lias egna bilder. Produktbilderna har texten "illustrationer".
- Bokningens kategoribilder för Herr, Dam och Barn är AI-bilder tills Lia lägger in egna.

**Kontakt och demo**
- Kontaktformuläret har ingen server.
  - I demoläge simuleras skickandet.
  - Utan demoläge öppnas kundens e-postprogram (mailto) med meddelandet.
- Telefonnumret är en platshållare och visas därför utan ring-länk.

**Ändringar Tommy bad om under arbetet**
- Appen öppnas alltid på startsidan.
- Varje flik börjar längst upp.
- Bokningen har bara frisörtjänster (Herr, Dam, Barn), utan flikar för Keramik och Workshop.

## 5. Uppgifter som ägaren behöver bekräfta
**Kontrollpunkt enligt uppdraget**
- **Färgning dam 449 kr.** Priset är lägre än övriga damtjänster. Tommy har bekräftat att det stämmer tills vidare. Priset är inte ändrat.

**Uppgifter som saknas eller är exempel**
- **Telefonnummer.** 070-XXX XX XX är en platshållare. Fyll i `CONTACT.phone` och `CONTACT.tel` i index.html.
- **E-post och adress.** lias@hantverkeri.se kommer från den gamla appen, och adressen är bara "Karlskoga".
- **Öppettider.** De finns i `OPENING`. Ändras de måste de också ändras i SQL-funktionen `create_booking`.
- **Kursstartdatum.** Datumen är exempel i demon.
- **Lagersaldo.** Siffrorna är exempel i demon.

**Produktfakta**
- Till exempel "Mat- och diskmaskinssäker" för tallriken. Texterna kommer från den gamla appen.

**Bilder**
- Kundbilder får bara visas med kundens godkännande.
- Loggan finns bara i cirka 105 pixlar. Originalfilen behövs.

**Regler och lagkrav**
- **Kassaregister.** Skatteverket kräver kassaregister vid kort- och Swishbetalning, med vissa undantag. Appen ersätter inte ett kassaregister.

## 6. Starta appen lokalt
- **Publicerat:** öppna https://bergqvistens.github.io/Lias-Fris-rsalong-/
- **Lokalt:** mappen `bilder/` måste ligga bredvid `index.html`. Starta en enkel webbserver i mappen, till exempel `python3 -m http.server 8000`, och öppna http://localhost:8000. Det behövs internet för React, Babel och typsnitt. Att öppna filen direkt utan server har inte testats.
- **Demoläge:** appen körs i demoläge tills Supabase-uppgifterna har fyllts i, se `INSTALLATION.md`. Lägg till `?demo=1` i adressen för att tvinga demoläge. Admin i demo loggar in med lia@demo.se / demo1234.
- **Förhandsvisningen i Claude-chatten** visar inte bilderna, eftersom den bara öppnar index.html. Skärmen blev också tom när filen var över 2 MB.

## 7. Så testades funktionerna
**Hur testerna körs**
- Automatiska tester i Chromium via Playwright, se `tester/LASMIG.md`. Totalt 464 kontroller och alla gick igenom den 26 oktober.

**Vad som testades**
- **Flöden:** frisörbokning, kursbokning och köp i demoläge, samt frisörbokning i Supabase-läge mot riktig PostgreSQL.
- **Databasen:** 27 regeltester, bland annat krockspärr och behörigheter.
- **Skärmar:** bredderna 320, 375, 390 och 430 px samt 130 % text. Testet kontrollerar att sidan inte scrollar i sidled, att text inte klipps av och att menyn inte täcker innehållet.
- **Tillgänglighet:**
  - Kontrast på 4,5:1 eller mer för text på turkos och i kort.
  - En h1 per sida och inga hopp i rubriknivåer.
  - Alt-attribut på alla bilder.
  - Namn på alla knappar.
  - Tryckytor på minst 44 × 44 px.
  - Synlig fokusmarkering och navigering med tangentbordet.
  - aria-current, aria-pressed, role=dialog och role=alert/status där de behövs.
- **Fel- och laddningsstatus:** testerna simulerade att tider, kursplatser och lager inte gick att hämta.
- **Prestanda:** startsidan hämtar 4 bilder. Övriga bilder laddas först när de behövs (lazy) och alla bildytor har bestämd proportion.

**Fel som slutprovet hittade och som rättades**
- Kurssidan visade "Hämtar…" för alltid om platserna inte gick att hämta.
- Shoppen visade inget meddelande när lagret inte gick att hämta.
- Rubrikerna hoppade från h1 till h3.
- Admin-länken var för liten att trycka på.
- "Kontakt" klipptes av i menyn vid 320 px och 130 % text.

**Ej testat**
- Riktiga Supabase-servrar, riktig betalning, riktiga sms och Safari/iPhone. Testerna kör Chromium.

## 8. Byta de tillfälliga bilderna
- Alla bilder ligger i `bilder/` och listas överst i index.html i `window.LH_IMG`.
- **Enklast:** ersätt filen med en ny med **samma namn**. Behåll WebP-formatet eller ändra filändelsen i `window.LH_IMG`.
- **Rekommenderade storlekar:**
  - Produktbilder: 600×600 px, proportion 1:1.
  - Hero- och bannerbilder: 960 px breda, proportion 3:2.
  - Galleribilder: cirka 640×960 px, porträtt.
- **Var bilderna kopplas:**
  - Produktbilder: `PRODUCT_IMG`.
  - Kategoribilder i bokningen: `CAT_IMG`.
  - Galleriet: listan `GALLERY`. Sätt `own: true` på Lias egna bilder, så visas de under "Från Lias salong" i stället för som inspirationsbild.
- Nya bilder ska helst vara WebP och under cirka 150 KB.
- Bannerbilderna har text inbakad. Det strider mot uppdragets regel om text i bild, men Tommy valde dem. Beskrivningen för skärmläsare innehåller samma text.

## 9. Risker och kvarvarande problem
- **Supabase är inte inkopplat.** Allt körs i demoläge, och kursbokning och beställningar har ingen databas än.
- **Betalningen är simulerad.** Riktig Swish eller kortbetalning saknas.
- **Kassaregister** krävs troligen för kort- och Swishbetalningar, se punkt 5.
- **GDPR och typsnitt.** Typsnitten hämtas från Google, vilket skickar besökarnas IP-adresser dit. Det bör lösas genom att lägga typsnitten i repot.
- **Prestanda på äldre telefoner.** Babel omvandlar appens kod i telefonen varje gång sidan öppnas. Det är inte mätt på riktiga telefoner. En förbyggd version, utan Babel i webbläsaren, är snabbare.
- **Beroende av CDN.** Om cdnjs eller jsdelivr inte svarar startar inte appen.
- **AI-bilder** måste ersättas med riktiga bilder innan skarp drift. Kundbilder kräver godkännande.
- **Admin har kvar den gamla stilen.** Planerat steg 6: bilduppladdning, ekonomiöversikt, kvittosök och export. En Fortnox-koppling kräver Supabase och en server.
- **Demodata sparas i webbläsarens localStorage** och försvinner om man rensar webbläsaren. Det är meningen.

## Tillägg: steg 6 – admin (26 oktober 2026, demoläge)
Utöver uppdraget, på Tommys begäran. Admin har nu tre flikar:
- **Bokningar** – samma som tidigare.
- **Ekonomi:**
  - Inkomst idag och de senaste 24 timmarna.
  - Inkomst per dag för de senaste 14 dagarna.
  - Betalningar det senaste dygnet.
  - Registrering av betalning på plats för frisör- och kursbesök, med Swish, kort eller kontant. Varje betalning får ett kvittonummer (K-…).
  - Sökning på kvitto med kvittovy.
  - Månadsexport som CSV-fil till revisorn.
- **Bilder:** Lia laddar upp bilder. De förminskas automatiskt, och kundens godkännande krävs innan de sparas. De visas sedan först i galleriet under "Från Lias salong".

Begränsningar:
- Allt sparas bara i demons webbläsarlagring.
- I Supabase-läge visar flikarna att funktionerna inte är byggda än. Det kräver tabeller för betalningar och bilder samt Supabase Storage.
- Ekonomiöversikten är inte bokföring och ersätter inte ett kassaregister.
- Fortnox-koppling är inte byggd. Den kräver Supabase och en server.

Test: `tester/s6check.js`, 52 av 52.
