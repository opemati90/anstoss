# German Amateur Football Domain Glossary

How German amateur football concepts map to Anstoss data models.

## Club Structure

| German Term | English | Anstoss Model | Notes |
|---|---|---|---|
| **Verein** | Club / Association | `Club` | The top-level entity. Almost always an **e.V.** (eingetragener Verein = registered association). Non-profit by law. Has a Vorstand (board), Satzung (bylaws), and is registered at the local Amtsgericht. |
| **Vorstand** | Board / Executive Committee | `Membership(role: OWNER \| ADMIN)` | Legally required for an e.V. Typically: 1. Vorsitzender (chairman), 2. Vorsitzender (vice), Kassenwart (treasurer), Schriftführer (secretary). In Anstoss, these map to OWNER and ADMIN roles. |
| **Abteilung** | Department / Section | `TeamGroup` | Large clubs have multiple Abteilungen (football, handball, tennis). Even within football, youth and senior sections often operate semi-independently. Maps to TeamGroup with `type: SENIOR \| YOUTH \| MINI \| CUSTOM`. |
| **Mannschaft** | Team / Squad | `Team` | A specific playing squad. Examples: "1. Herren" (first men's team), "U16 Junioren", "Bambini F2". Each has its own training schedule, matches, and roster. |

## People & Roles

| German Term | English | Anstoss Model | Notes |
|---|---|---|---|
| **Trainer** | Coach / Manager | `TeamAccess(role: HEAD_COACH)` | The person running training and selecting the lineup. In German amateur football, often a volunteer parent or semi-professional. Head coaches have full team management rights. |
| **Co-Trainer** | Assistant Coach | `TeamAccess(role: ASSISTANT_COACH)` | Assists the Trainer. Can manage events and RSVPs but typically can't make roster changes alone. |
| **Spieler** | Player | `TeamAccess(role: PLAYER)` | A registered squad member. May play for multiple teams within the same club (see Zweitspielrecht). |
| **Elternteil** | Parent / Guardian | `TeamAccess(role: PARENT)`, `GuardianRelationship` | For youth teams (U16 and below). Required for GDPR Article 8 compliance. Receives notifications, can RSVP on behalf of the child, and must consent to data processing. |
| **Spielerpass** | Player Pass / Registration | Not modelled (external: DFBnet) | Official registration document linking a player to a club in the DFB system. Required to be eligible for competitive matches. Transfer between clubs requires a formal Spielerpassfreigabe (release). |

## Competition & Governance

| German Term | English | Anstoss Model | Notes |
|---|---|---|---|
| **Kreisverband** | District Association | Not modelled | The lowest tier of the DFB governance pyramid. Organises leagues, cup competitions, and disciplinary proceedings for amateur clubs in a geographic district (Kreis). |
| **Bezirk / Landesverband** | Regional / State Association | Not modelled | Mid-tier governance. Bundesliga clubs are under DFL; amateurs are under their Landesverband (e.g., FVM for Mittelrhein, BFV for Bayern). |
| **Spielklasse** | League / Division | `ImportedFixture.competition` | German amateur football has a deep pyramid: Kreisliga D → C → B → A → Bezirksliga → Landesliga → etc. Anstoss imports fixture data but doesn't manage league operations. |
| **Spieltag** | Match Day | `Event(type: MATCH)` | A scheduled competitive match. In youth football, often played on Saturday mornings. Senior matches are typically Sunday afternoons. |

## Operations & Finance

| German Term | English | Anstoss Model | Notes |
|---|---|---|---|
| **Mitgliedsbeitrag** | Membership Dues | `Subscription` (Stripe) | Annual or monthly fee paid by members to the e.V. Typically EUR 5-15/month for youth, EUR 10-25/month for seniors. Collected via SEPA Lastschrift (direct debit). |
| **Lastschrift (SEPA)** | Direct Debit | Stripe SEPA Direct Debit | The dominant payment method in German clubs. Members provide an IBAN and a SEPA mandate. The club pulls payments automatically. Anstoss uses Stripe Connect with SEPA. |
| **Arbeitsstunden** | Volunteer Hours | Not modelled | Many e.V. bylaws require members to contribute X hours per season (field maintenance, canteen duty, events). Non-fulfilment triggers a penalty fee (Strafgebühr). Future feature candidate. |
| **DFBnet** | DFB Digital Platform | `FussballDeLink` (external link) | The DFB's official digital platform for match reporting, player registration, and referee assignments. Clubs must use it for competitive play. Anstoss links to it but doesn't replace it. |

## Youth-Specific

| German Term | English | Anstoss Model | Notes |
|---|---|---|---|
| **Jugendordnung** | Youth Regulations | Age gate logic | DFB age group rules: staggered by birth year. A-Jugend (U19), B-Jugend (U17), C-Jugend (U15), D-Jugend (U13), E-Jugend (U11), F-Jugend (U9), Bambini (U7). |
| **Sorgeberechtigte** | Legal Guardians | `ParentalConsent`, `GuardianRelationship` | GDPR Article 8 (Germany = 16): under-16 players need explicit parental consent for data processing. Anstoss enforces this via the age gate and parental consent flow. |
| **Zweitspielrecht** | Dual Registration Right | `PlayerLoan` | Allows a youth player to play for a second team within the same club (e.g., playing up an age group). Requires registration at the Kreisverband. Modelled as PlayerLoan in Anstoss. |
| **Probetraining** | Trial Training | `TeamAccess(phase: TRIAL)` | New players attend 2-3 trial sessions before formal registration. Anstoss supports trial phase access that coaches can approve or reject. |

## Key Differences from English Football

1. **e.V. structure**: German clubs are member-owned associations, not companies. Every member has voting rights at the Mitgliederversammlung (AGM).
2. **No transfer fees at amateur level**: Players are released via Spielerpass, but no money changes hands (unlike English non-league where nominal fees exist).
3. **SEPA dominance**: Card payments are uncommon. Direct debit (Lastschrift) is the default for recurring fees.
4. **Volunteer culture**: German amateur clubs run on volunteer labour. Paid positions are rare below Landesliga level.
5. **Mandatory insurance**: All registered players are covered by the Landesverband's group insurance (Sportversicherung). This is automatic upon Spielerpass registration.
