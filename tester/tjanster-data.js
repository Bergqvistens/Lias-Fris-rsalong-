// Lias 17 tjänster – källa: kalla/tjanster-lia.md (avskrivet från Valei 28–29 okt 2026, två stavfel rättade)
// Ordning: Klippning först (vanligast), sedan som i Valei.
module.exports = {
  CATS: ['Klippning', 'Färgbehandling', 'Permanent', 'Styling, tvätt & föning', 'Hårbottenmassage', 'Frans och/eller brynfärg'],
  SERVICES: [
    { id: 'klipp-45', cat: 'Klippning', name: 'Klippning 45 min.', dur: 45, price: 600, desc: 'Inklusive tvätt, fön och lättare styling. För dig som har normalt till tjockt hår. Vid extra långt eller tjockt hår, boka 60 min klippning.' },
    { id: 'klipp-lyx', cat: 'Klippning', name: 'Klippning lyx', dur: 60, price: 850, desc: 'Klippning tvätt och fön. För dig med lite tjockare & längre hår. Här ingår konsultation, schamponering med inpackning och skalpmassage.' },
    { id: 'klipp-30', cat: 'Klippning', name: 'Klippning/Herrklippning 30 min', dur: 30, price: 500, desc: 'Klippning. Kort hår, tunt till normalt, max längd till nyckelbenen, ej schamponering eller längre konsultation. För dig som inte vill göra en större förändring av frisyren.' },
    { id: 'putsning', cat: 'Klippning', name: 'Putsning, kort hår med maskinklippn. sidor & nacke.', dur: 15, price: 250, desc: 'En uppfräschning mellan en hel, vanlig klippning, fokus på nacke och sidor enbart.' },
    { id: 'farg-botten', cat: 'Färgbehandling', name: 'Bottenfärg/utväxt klippning ingår ej, boka till om så önskas.', dur: 90, price: 1000, desc: 'Passar dig som har en utväxt på max 2-4 cm och kort hår. du vill göra en färgförändring eller uppfräschning. Materialkostnad tillkommer beroende på hårets tjocklek. Tvätt och fön ingår. Klippning eller slingor ingår ej.' },
    { id: 'farg-150', cat: 'Färgbehandling', name: 'Färgbehandling 2.5 timmar Klippning ingår.', dur: 150, price: 2000, desc: 'Passar dig som vill göra färgning, slingor och/eller -Balayage eller folieslingor i hela håret. -Långt hår! Klippning ingår.' },
    { id: 'farg-180', cat: 'Färgbehandling', name: 'Färgbehandling 3 timmar, klippning ingår.', dur: 180, price: 2500, desc: 'Passar dig som vill göra en extra avancerad färgning eller har väldigt långt och tjockt hår. Materialkostnad kan tillkomma. Om du känner dig osäker på vad du ska boka, kontakta mig.' },
    { id: 'klipp-farg-kort', cat: 'Färgbehandling', name: 'Klipp & färg, kort hår. Som längst till nyckelbenen.', dur: 135, price: 1350, desc: 'För dig som bara vill färga utväxten (ca.2 cm)och klippa topparna (Puts) Ingår: tvätt och lättare styling. Tillägg kan förekomma vid tjockt hår. om du är osäker kontakta mig så löser vi det. 073-6423018' },
    { id: 'nyansering', cat: 'Färgbehandling', name: 'Nyansering', dur: 60, price: 1100, desc: 'Utjämning av utväxt eller lättare färgförändring! I behandlingen ingår också tvätt och lättare styling/föning!' },
    { id: 'perm-kort', cat: 'Permanent', name: 'Permanent inkl. klippning kort hår.', dur: 120, price: 1650, desc: 'Permanent på kort hår, max 10 cm. Hårets tjocklek och längd avgör prisnivån.' },
    { id: 'perm-mellan', cat: 'Permanent', name: 'Permanent inkl. klippning mellanlångt hår.', dur: 150, price: 1900, desc: 'Permanent på hår med 10-20 cm längd. Hårets tjocklek och längd avgör prisnivån.' },
    { id: 'perm-lang', cat: 'Permanent', name: 'Permanent inkl. klippning långt hår.', dur: 180, price: 3000, desc: 'Permanent på hår längre än 20 cm' },
    { id: 'tvatt-fon', cat: 'Styling, tvätt & föning', name: 'Tvätt & fön', dur: 30, price: 400, desc: 'Tvätt & enklare fön/ styling' },
    { id: 'tvatt-fon-60', cat: 'Styling, tvätt & föning', name: 'Tvätt & fön/ styling 1 timma', dur: 60, price: 800, desc: 'Tvätt & fön/ styling inkl. produkt tips.' },
    { id: 'harbotten', cat: 'Hårbottenmassage', name: 'Hårbottenmassage', dur: 45, price: 750, desc: 'Djupgående massage med utvalda produkter och lättare föning/ styling efteråt. Om fler behandlingar önskas, t ex klippning,så bokas detta separat.' },
    { id: 'bryn', cat: 'Frans och/eller brynfärg', name: 'Färg och form av bryn.', dur: 30, price: 200, desc: 'Färgning & plockning av bryn.' },
    { id: 'frans-bryn', cat: 'Frans och/eller brynfärg', name: 'Ögonfransfärgning & brynfärg + formning', dur: 30, price: 250, desc: 'Få dina bryn & fransar färgade & fixade. -färgning av fransar -färgning av bryn -plockning av bryn' },
  ],
};
