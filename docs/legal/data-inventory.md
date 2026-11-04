# Personal data inventory

Source of truth for `/privacy` and `/terms` (`frontend/marketing/src/app/(legal)/`). Built from a
read-only audit of the code on the `capacitor` branch, 3 November 2026. Keep it current when a
feature starts storing or sending personal data.

Everything below is **draft, pending legal review**. Open items are listed at the end.

## Where data lives

| Store | Service | Region | Encryption at rest | Backups |
|---|---|---|---|---|
| Account, content and settings tables | Amazon DynamoDB | eu-west-2 (London) | AWS default (AWS-owned key) | None. No point-in-time recovery; tables are `RETAIN` |
| Media (audio, images, voice notes) | Amazon S3 behind CloudFront | eu-west-2; CloudFront edge caches worldwide | SSE-S3 | Versioned; old versions expire after 90 days |
| Sign-in identities | Amazon Cognito (`medimade-users`) | eu-west-2 | AWS managed | AWS managed |
| API keys | AWS Secrets Manager | eu-west-2 | KMS | n/a |
| Server logs | Amazon CloudWatch Logs | eu-west-2 | AWS default | No retention set (kept indefinitely) |
| Web and marketing hosting | AWS (SST) + CloudFront | eu-west-2 + edge | n/a | n/a |
| Device cache | Browser localStorage / app WebView storage; iOS Keychain for the refresh token | User's device | Device/OS | n/a |

## Personal data, by kind

Retention is "until account deletion" unless stated.

### Account and sign-in

| Data | Where | Retention | On deletion |
|---|---|---|---|
| Email, user ID, display name, Cognito sub, role, plan, created date | DynamoDB Users | Account lifetime | Deleted |
| Email, optional name, password hash, passkeys, MFA | Cognito | Account lifetime | Deleted |
| Apple / Google ID token claims (email, possibly Apple private-relay address, name) | Read at sign-in; email + name kept in Users | Account lifetime | Deleted |
| Magic-link token, optional 6-digit code, email, requester IP (rate limit) | DynamoDB MagicLink | 15 minutes (TTL) | Expires |
| Refresh tokens (hashed) + user ID | DynamoDB Refresh | 30 days (TTL) | Deleted |
| Username | DynamoDB MeditationAnalytics (`USERNAME`) | Account lifetime | Deleted |
| Stripe customer and subscription IDs | DynamoDB Users | Account lifetime | Row deleted; **Stripe records stay** |
| Waitlist: email, brief (≤ 2,000 chars), source, referrer, UTM, linked user ID | DynamoDB Waitlist; brief/source copied to Users at first sign-in | Indefinite | **Not deleted** |
| Waitlist rate-limit rows (IP) | DynamoDB Waitlist | ~1 hour (TTL) | Expires |

### Content (often sensitive: mental health and wellbeing)

| Data | Where | On deletion |
|---|---|---|
| Journal entries (title, HTML, mood, tags), gratitudes | DynamoDB Journal; Algolia index | Dynamo deleted; **Algolia not deleted** |
| Journal insights, topics, weekly letters | DynamoDB JournalInsights | Deleted |
| Weekly letter audio | S3 `insights/letter-audio/{userId}/` | **Not deleted** |
| Journal voice notes | S3 `journal/voice/{userId}/` | **Not deleted** |
| Journal voice transcription audio + transcript | S3 `journal-transcriptions/{userId}/` (or `guest/` when signed out) | User prefix deleted; **`guest/` not** |
| Imported journals (PDF, images, Day One, docx, markdown) | Parsed in the browser; PDFs and some images sent to Anthropic for text extraction; result saved as journal entries | As journal |
| Manifest: life areas, goals, to-dos, values, regrets, quotes, manifesto, resistance, vision board | DynamoDB Ideate; Habits table for habits/affirmations; Algolia index | Dynamo deleted; **Algolia not** |
| Vision board images: **user's own face photo**, photos of other people or pets, generated images | S3 `ideate/vision/{userId}/` | **Not deleted** |
| Assistant / coach chat (can read journal and insights) | DynamoDB AssistantChat | Deleted |
| Meditation briefs and scripts (plus email) | DynamoDB MeditationJobs; S3 `drafts/{userId}/` | Drafts deleted; **jobs table not** |
| Generated meditation audio and covers | S3 `meditations/`, `meditation-covers/`, `programs/` under `{userId}/` | `meditations/`, `meditation-covers/` deleted; **`programs/` not** |
| Library rows, ratings, favourites, mixes, shares | DynamoDB MeditationAnalytics / ListenerMix (`USER#{userId}`) | Deleted |
| Public Listen pages: title, description, "shown as" name, optional brief, listed flag | DynamoDB MeditationAnalytics (`LISTEN_SLUG`, `LISTEN_PATH`); public at `/listen/{username}/{slug}` | **Registry rows not deleted** |
| Heal | Appears to be device-only (`mm_heal_v1`); sent to Anthropic when used | n/a (device) |

### Usage, settings and device

| Data | Where | Retention | On deletion |
|---|---|---|---|
| Settings (pronouns, AI preferences, notifications, theme, language, time zone, defaults) | DynamoDB Users | Account lifetime | Deleted |
| AI usage events (provider, feature, model, tokens, cost, user ID) | DynamoDB AiUsage | ~120 days (TTL); aggregates without user ID kept | Expire |
| Guest listener ID (random UUID) | localStorage + DynamoDB ListenerMix `GUEST#…` | Indefinite | n/a |
| Server logs (user ID, errors, request metadata) | CloudWatch | Indefinite | **Not deleted** |
| Cookies: HttpOnly refresh/access cookies, `mm_has_session` hint | Browser | Session / 30 days | Cleared on sign-out |
| localStorage: session, journal cache, Manifest cache, chat cache, focus, preferences | Device | Until cleared | **Not cleared by account deletion** (unverified) |
| Native: refresh token in iOS Keychain | Device | Until sign-out | Cleared on sign-out |
| Email delivery events (bounces, complaints: address, diagnostic) | SES account suppression list; CloudWatch | SES: until removed; logs indefinite | Not deleted |

**Not collected:** precise location, contacts, advertising IDs, card numbers (Stripe Checkout only),
client-side analytics or error tracking (none installed). No age or date of birth is collected.

## Third parties

| Recipient | Role | Receives | Region | Training on our data |
|---|---|---|---|---|
| Amazon Web Services | Processor (hosting, database, storage, email via SES) | Everything | UK (London) | No (AWS service terms) |
| Anthropic (Claude) | Processor | Briefs, scripts, chat (incl. journal excerpts), journal insights and letters, Heal, Manifesto Story, affirmations, imported PDFs/images, vision prompts | US | **Unconfirmed** |
| OpenAI | Processor | Journal voice audio (Whisper transcription); meditation cover prompts | US | **Unconfirmed** |
| Google (Gemini) | Processor | Vision board: **face photo**, other people/pet photos, prompts; cover images | US / global | **Unconfirmed** |
| Speechify | Processor (legacy/admin paths may remain in code) | Meditation/letter TTS | US | Policy currently names RunPod only for voice — confirm Speechify usage |
| ~~Fish Audio~~ | Not used (product) | — | — | Still present in some backend/admin code; not named in privacy |
| RunPod (self-hosted Orpheus voice model) | Processor (compute) | Script text | Unknown GPU region | Model is ours; RunPod retention **unconfirmed** |
| Algolia | Processor (search) | Journal, Manifest, vision and meditation text, keyed by email | **Unconfirmed** (index region) | **Unconfirmed** |
| Brevo (current) / Amazon SES (after switch) | Processor (email) | Email address, sign-in email content | Brevo: EU; SES: UK | No |
| Stripe | Independent controller for payments | Email, user ID, plan; card details on Stripe's page | US / EU | n/a |
| Apple, Google | Independent controllers | Sign-in (ID tokens); on-device dictation in the app; App Store / Play purchases | Global | n/a |
| Google Fonts | Third party (web app only) | Visitor IP when fonts load | Global | n/a |
| unpkg, jsDelivr (likely) | CDN | Visitor IP when the PDF reader or OCR data loads during journal import | Global | n/a |

## Known gaps to fix (not policy text, engineering)

These make the deletion and sharing promises in the policy partly untrue today. The policy is
written to the intended behaviour; fix these before publishing, or soften the policy.

1. Account deletion misses: Algolia records, MeditationJobs rows, waitlist row, S3
   `journal/voice/`, `ideate/vision/`, `insights/letter-audio/`, `programs/`, Listen registry rows,
   Stripe customer (not cancelled).
2. S3 versioning keeps deleted files for 90 days; the policy says "within 90 days" to match.
3. CloudWatch logs have no retention. Suggest 30–90 days.
4. Media (voice notes, face photos) is served via unsigned CloudFront URLs: anyone with the URL
   can open it.
5. "Continue as guest" signs everyone into one shared real account: anything typed there is visible
   to other guests. The policy says so; consider separate guest sessions.
6. No full data export (journal export only).
7. `frontend/webapp/src/lib/ai-providers.ts` lists only Anthropic and Fish Audio, and says Fish
   never receives your journal. It's missing OpenAI, Google, Speechify (which narrates letters
   drawn from journals), RunPod and Algolia.
8. Settings toggles `ai.personaliseWithJournal`, `postAnonymously`, `shareAnonymousUsage`,
   `showActivityInConnect` aren't implemented; the policy doesn't describe them as controls.
9. No age check anywhere.

## Bracketed placeholders (still open)

Filled: Alex Maragakis trading as Consciously; Weave Coworking, Cotton Works, Wigan WN3 5EX;
`privacy@consciously.live`; age 18; notice 30 days. Guest mode section removed from privacy until
guest content is private per guest.

Still highlighted on the pages:

- `[ICO REGISTRATION NUMBER]`
- `[REFUND TERMS]` (terms only): web/Stripe refund policy beyond statutory rights
- `[ALGOLIA REGION]`: confirm Algolia index region

## Unconfirmed / to confirm

- Speechify: still in code for some TTS; not named on the privacy page — confirm whether to add
  it or stop using it. Fish Audio is not used product-side (still in some backend/admin code).
- Algolia region.
