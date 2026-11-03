# Children's-data lawful-basis decision record — not approved

**Superseded product scope, 28 October:** the owner confirmed an 18+ first release,
with youth/guardian participation and dedicated health reporting Coming Soon.
See [the current decision](adult-first-release-2026-10-28.md). The September
findings below are a historical worksheet, not the current audience answer.
Existing records remain; their lawful handling, rights and retention obligations
are not removed by restricting new participation. No legal approval is implied.

Owner: Anstoss legal/product + each participating club as controller for club records. Date: 24 September 2026. This is a decision worksheet, **not** a legal conclusion or proof of guardian authority. Obtain German/EU privacy counsel sign-off before inviting minors.

Authoritative references: [GDPR Articles 5–9, 13, 28, 35 and 44–46](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng), [EDPB consent guidance, children's consent and parental responsibility](https://www.edpb.europa.eu/sites/default/files/files/file1/20180416_article29wpguidelinesonconsent_publish_en.pdf), [Google Play target audience](https://support.google.com/googleplay/android-developer/answer/9867159).

## Decision to make for each purpose

| Processing purpose | Controller candidate | Article 6 basis to validate | Additional condition and release evidence |
| --- | --- | --- | --- |
| Child account, club/team roster, event availability | Club for its membership decisions; Anstoss for its own account operation where applicable | Club must choose and document a viable basis (e.g. membership contract or appropriately balanced legitimate interest); **do not** describe every field as consent-based by default | Age floor, guardian relationship, necessity/minimization, notice to child and guardian, access/erasure route. |
| Child-directed information-society account where the chosen Article 6 basis is consent | Controller offering that service | Art. 6(1)(a), if chosen | In Germany, Art. 8 GDPR requires holder-of-parental-responsibility authorization below 16 and reasonable verification effort. Art. 8 is **conditional on consent being the basis**; it is not a universal basis for all children's records. Provide withdrawal as easy as consent, without retroactively invalidating earlier lawful processing. |
| Chat, media, push | Determine club vs Anstoss responsibility by purpose | Document separately; functionality does not automatically make every optional feature contract-necessary | Child-safe contacts, moderation, default visibility, media retention, no advertising profiling, notification controls. |
| RSVP sick/injured reasons and free-text notes; injury/medic notes, medical checks and vaccination status | Club; possibly Anstoss as processor | Article 6 basis **plus** an Article 9(2) exception | Health information is special-category data. Medic/Compliance switches do not stop RSVP health collection. The owner chose to **retain** injury/sickness RSVP reasons and notes. Establish the exception, purpose-specific notice, access limits, retention and DPIA decision before launch; the owner cannot waive Article 9 obligations by describing the data as informal. |
| Background-check / Führungszeugnis status or document | Club; possibly Anstoss as processor | Article 6 basis plus **Article 10 and applicable national-law** review | Criminal-conviction/offence data have additional restrictions. Do not collect document scans/status through generic compliance records until counsel approves purpose, lawful authority, access and retention. |
| Security logs / fraud prevention | Anstoss and/or club according to control | Document necessity and balancing or other basis | Minimize child identifiers, no chat body in logs, defined retention, provider configuration evidence. |

## Product-control findings

- The owner chose **13 as the minimum age for a child's direct app login**; younger children are guardian-managed only. The HTTP age gate and `/me` projection block **known** under-13 DOBs even with a consent row. However a DOB-less user can currently send `confirmAdult:true` to the generic profile endpoint and be treated as 16+; this self-declaration path means the minimum age is **not technically proven**. Close it, then test every auth/socket/onboarding/existing-session path before declaring the Play audience.
- On 24 Sep 2026 the owner specifically chose to keep RSVP injury/sickness reasons and free-text notes for players to explain unavailability. This is a product decision, **not** a lawful-basis decision or consent record. The release stays blocked until the special-category path is reviewed and evidenced.
- An email OTP to a child-supplied guardian address proves access to that mailbox, **not automatically parental responsibility**. Define the reasonable verification method, fraud/review path, consent evidence (who/what/when/version), and reassessment when a child turns 16.
- The public legal page states a guardian may withdraw and child access will be disabled. Code and tests must prove withdrawal revokes all relevant club/team and realtime access. An in-progress consent implementation must pass an independent security review before this statement is relied upon.
- Current roster-operations code had exposed every teammate's injury title/status to any team reader, including players and parents. A need-to-know API projection and regression tests were added in this audit; the medic feature is being disabled for the first public release pending Art. 9 approval. Verify the final release API and client actually use the restriction.
- Review every child-to-child/adult DM permission and historical-access path; a guardian flow alone does not satisfy safeguarding. Children must not be exposed to random/anonymous chat or third-party ads.
- Document who answers data-subject requests: a club controller may direct Anstoss as processor, but Anstoss's own account/security processing may require its own response. The child should receive age-appropriate notice.

## Approval record

- Minimum direct-user age: **13, owner decision 24 Sep 2026**. Play brackets (13–15, 16–17, adult groups) and all enforcement paths: **OPEN pending full test**.
- Purpose-by-purpose Article 6 decision, Article 9 exception for all health/medic and vaccination data, Article 10 background-check treatment, and controller split: **OPEN**.
- Guardian-verification design and withdrawal end-to-end test: **OPEN**.
- DPIA screening for children's profiles, chat and medic data: **OPEN**.
- Counsel name, approval date, policy version and club instructions: **OPEN**.

Do not mark minors' processing “consent obtained” or the Play Families declaration complete until those decisions and tests are recorded.
