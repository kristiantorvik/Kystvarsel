# Personvernerklæring for Kystvarsel

**Sist oppdatert:** 8. mai 2026

Kystvarsel er utviklet med personvern som førsteprinsipp. Dette dokumentet
forklarer hvilke data appen håndterer, og — like viktig — hvilke data den
**ikke** samler inn.

---

## Kort oppsummering

- **Ingen brukerkonto** — du logger ikke inn, og det finnes ingen registrering.
- **Ingen sky-lagring** — alle stedene, varslene, taggene og kartlagene dine
  ligger lokalt på din egen enhet.
- **Ingen analyse, ingen sporing, ingen reklame** — appen sender ikke data om
  bruksmønstre til oss eller til tredjeparter.
- **Værdata hentes direkte** fra MET Norway og Kartverket. Forespørselen din
  går rett til de offentlige etatene; vi har ingen mellomtjener som ser
  trafikken.

---

## Hvilke data lagres lokalt?

På enheten din lagrer Kystvarsel følgende i en SQLite-database som bare
appen har tilgang til:

- Steder du har lagt til (navn, posisjon, eventuell kommentar)
- Varsler du har konfigurert (kriterier, tidsvinduer)
- Tagger og koblinger mellom tagger og steder
- Tegnede kartlag
- Mellomlagrede værvarsel (slik at appen virker uten nett en kort stund)
- Innstillinger (f.eks. tidspunkt for daglig sjekk)

Disse dataene forlater **aldri** enheten din, med ett unntak: hvis du selv
trykker «Del fil» eller «Lagre til Filer» under Innstillinger →
Datasikring og selv velger å eksportere dem.

---

## Hvilke data sendes over nettverket?

Når du åpner et værvarsel eller den daglige bakgrunnssjekken kjører,
sender appen følgende forespørsler:

| Mottaker | Data sendt | Formål |
|----------|------------|--------|
| `api.met.no` (MET Norway) | Breddegrad, lengdegrad, samt en `User-Agent`-streng som identifiserer appen og kontaktadressen til utvikler | Hente vær- og havvarsel |
| `vannstand.kartverket.no` (Kartverket) | Breddegrad, lengdegrad | Hente tidevannsdata |
| `cache.kartverket.no` (Kartverket) | Posisjon, zoom-nivå (vanlige WMTS-forespørsler) | Vise kartfliser |

Vi sender **ikke** med:
- Brukernavn, e-post eller andre personopplysninger
- En unik enhets-ID, installasjons-ID eller IP-utover det som ligger i
  selve nettverkstilkoblingen
- Hvilke varsler eller alarmer du har konfigurert

MET Norway og Kartverket er offentlige norske etater. Deres bruksvilkår
finner du på henholdsvis [met.no](https://api.met.no/conditions_of_service.html)
og [kartverket.no](https://www.kartverket.no/api-og-data/vilkar-for-bruk).

---

## Varsler

Hvis du gir tillatelse, vil Kystvarsel kunne sende lokale push-varsler
til enheten når lagrede alarmer matcher værvarslet. Disse varslene er
**lokale** — de genereres på enheten og går aldri innom en server.

Du kan når som helst skru av varselstillatelsen i systeminnstillingene
på telefonen.

---

## Eksport og import

Funksjonen «Del fil» lager en JSON-fil med alle stedene, varslene,
taggene og lagene dine, og lar deg dele den der du selv ønsker — for
eksempel til et passordbeskyttet skylager du selv kontrollerer, til en
annen enhet via Bluetooth, eller på e-post. Vi har ingen del i selve
delingen; appen leverer fila til operativsystemet og du bestemmer hvor
den skal.

---

## Endringer

Dersom personvernpraksisen endres i en framtidig versjon av appen, vil
det stå tydelig i nyhetsteksten ved oppdateringen. Vi kommer ikke til å
utvide datainnsamlingen i stillhet.

---

## Kontakt

Spørsmål om personvern? Send en e-post til **kystvarsel.app@gmail.com**.

---

## English summary

Kystvarsel is a privacy-first coastal weather app. All user data (saved
spots, alerts, tags, painted layers) is stored locally on the device in
a SQLite database. The app makes no user accounts, no analytics, no
crash reporting, and no third-party telemetry. Network traffic is
limited to MET Norway (forecast data) and Kartverket (tide data, map
tiles). The user can export their data via the system share sheet to
any destination they choose; nothing is shared automatically.

Contact: kystvarsel.app@gmail.com
