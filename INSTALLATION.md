# Koppla bokningen till Supabase – checklista

Det tar ungefär 10 minuter och går att göra från mobilen. Gör stegen i ordning.

## 1. Skapa projektet
1. Logga in på **supabase.com** och tryck **New project**.
2. Namn: `lias-hantverkeri`. Välj ett starkt databaslösenord och spara det.
3. Region: välj **North EU (Stockholm)** om den finns, annars en annan EU-region. Kunduppgifter bör ligga inom EU (GDPR).
4. Vänta tills projektet är klart (cirka 1–2 minuter).

## 2. Kör SQL-koden
1. Gå till **SQL Editor** → **New query**.
2. Öppna filen `supabase-setup.sql`, kopiera **hela** innehållet och klistra in det.
3. Tryck **Run**. Det ska stå **Success**. Det gör inget om du kör den igen.

## 3. Skapa Lias inloggning
1. Gå till **Authentication → Users → Add user → Create new user**.
2. Skriv Lias e-post och ett lösenord. Kryssa i **Auto Confirm User**.
3. Gå tillbaka till **SQL Editor**, klistra in raden nedan med Lias riktiga e-post och tryck **Run**:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'LIAS-EPOST@EXEMPEL.SE';
   ```
   Det ska stå **Success. 1 row** (eller liknande). Står det 0 rader är e-posten felstavad.

4. Extra säkerhet: under **Authentication → Sign In / Providers**, stäng av **Allow new users to sign up** om inställningen finns. Även om någon skulle registrera sig själv kan de inte se några bokningar, men det är onödigt att tillåta.

## 4. Hämta de två värdena
Gå till **Project Settings → API** (kan heta **Data API** / **API Keys**):
- **Project URL** – ser ut som `https://abcdefgh.supabase.co`
- **anon public**-nyckeln – en lång text som börjar med `eyJ`. Om du bara ser en ny "publishable key", titta under fliken **Legacy API keys**.

Skicka båda till Claude, så läggs de in i källfilen `kalla/app-kalla.html` och `index.html` byggs om. (Det går också att öppna `index.html` och byta ut `KLISTRA_IN_PROJECT_URL` och `KLISTRA_IN_ANON_PUBLIC_KEY` direkt – texterna finns kvar i den byggda koden – men då måste samma ändring göras i källfilen, annars försvinner den vid nästa bygge.) Nyckeln är gjord för att synas i webbsidor – skyddet ligger i databasens regler.

## 5. Lägg upp på GitHub
Ladda upp den nya `index.html` till repot. Sidan måste öppnas via GitHub Pages-adressen (https), annars fungerar inte skärmnotiserna.

## 6. Testa på riktigt
1. **Lias dator:** öppna sidan → **Admin** längst ner → logga in → tryck **Slå på larm** → tillåt notiser när webbläsaren frågar.
2. **Din mobil:** öppna sidan → **Boka** → boka en tid med ditt eget namn.
3. Kontrollera:
   - [ ] Mobilen visar **"Din tid är bokad!"**
   - [ ] Det plingar på Lias dator och en notis visas
   - [ ] Bokningen syns i listan, märkt **NY**
   - [ ] Den bokade tiden går inte att välja igen på mobilen
   - [ ] Tryck **Avboka** hos Lia → tiden blir ledig igen
4. Säg till Claude om något inte stämmer.

## Bra att veta
- **Larmet** fungerar när admin-sidan är öppen i en flik och datorn är vaken. Tryck **Slå på larm** varje gång sidan öppnas – webbläsare tillåter inte ljud annars. Bokningar som kommer in när datorn är avstängd syns i listan nästa gång Lia öppnar den.
- **Ändra pris eller längd** på en tjänst: ändra både i källfilen `kalla/app-kalla.html` (listan `SERVICES`, bygg sedan om `index.html`) och i Supabase (**Table Editor → services**). Det är databasens pris som gäller vid bokning.
- **Öppettider** finns på två ställen på samma sätt: `OPENING` i källfilen `kalla/app-kalla.html` och funktionen `create_booking` i SQL-koden.
- Kunden får **ingen** bekräftelse via SMS eller e-post än – bara beskedet på skärmen. Det kan läggas till senare.
