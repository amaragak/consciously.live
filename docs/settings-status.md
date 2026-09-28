# Settings status checklist

Single source of truth for wiring status. Keep in sync with `frontend/webapp/src/lib/settings-status.ts`.

Legend: **wired** · **not_implemented** · **not_available**

---

## Batch 1: AI & data

| Setting | Status | What’s needed to wire |
| --- | --- | --- |
| Who processes your data | wired | Config in `ai-providers.ts`; update when call sites change |
| Training claim + privacy policy | not_available | Flip `SHOW_AI_TRAINING_CLAIM` after legal OK |
| Personalise with my journal | not_implemented | Strip journal from prompts when off; JIT ask on Create |
| Insights from my journal | not_implemented | 403 generate when off; dialog link to `/settings/ai` |
| What Chat can do | not_implemented | Enforce suggest / ask / act in Chat tool layer |
| Delete AI-made data | not_implemented | Delete themes/scores/letters/embeddings with confirm |
| Clear chat history | wired | Empties local + remote assistant-chat store |
| Model / quality tier | not_available | Product does not expose tiers yet |

## Batch 2: Privacy

| Setting | Status | What’s needed to wire |
| --- | --- | --- |
| Journal lock | wired | Stores preference; PIN lock lives in Journal prefs |
| New meditations are | not_implemented | Apply visibility at every create path (incl. Chat) |
| Shared links → Manage | wired | Counts library share tokens; Manage → library |
| Community name | wired | `POST /auth/profile/display-name` |
| Post anonymously by default | not_implemented | Apply on new Connect posts/replies |
| Show my activity in Connect | not_implemented | Activity visibility flag |
| Blocked / muted | not_available | No block/mute product yet |
| Share anonymous usage data | not_implemented | Gate client + server analytics |

## Batch 3: Email

| Setting | Status | What’s needed to wire |
| --- | --- | --- |
| Transactional | wired | Always on; explained in UI |
| Product updates / newsletter | not_implemented | Check prefs before non-transactional send |
| Weekly summary | not_available | Summary email does not exist yet |
| Community replies / mentions | not_implemented | Check prefs + unsubscribe links |

## Batch 4: Notifications

| Setting | Status | What’s needed to wire |
| --- | --- | --- |
| Channels × categories grid | not_implemented | Central notify helper + channel checks |
| Daily reminder + time | not_available | Scheduler in user timezone |
| Focus session alerts | not_implemented | Start/end alerts honour preference |
| Quiet hours | not_implemented | Timezone-aware quiet window |
| Nudge style | not_implemented | Cap / suppress streak nudges |

## Batch 5: The rest

### Account

| Setting | Status | What’s needed to wire |
| --- | --- | --- |
| Email address | wired | Read-only from session |
| Name (display name) | wired | `POST /auth/profile/display-name` |
| Change email | not_available | Re-verify flow |
| Password | wired | In-app change (current → new) or email reset code; no Hosted UI |
| Active sessions | not_available | Device list API |
| Sign out everywhere | wired | Clears this session (remote revoke-all TBD) |
| Sign-in methods / passkeys | wired | Status display only (no Hosted UI manage) |
| Export all my data | not_available | Async export job + email link |
| Delete account | not_available | Grace period + wipe |

### Meditate

| Setting | Status | What’s needed to wire |
| --- | --- | --- |
| Default voice / length / type | wired | Local defaults + Create init; type stored for later |
| Background sound + volume | not_implemented | Player / Create mix defaults |
| Playback speed | not_implemented | Player reads setting |
| Downloads / offline | not_available | No offline pack yet |

### Focus

| Setting | Status | What’s needed to wire |
| --- | --- | --- |
| Default session + break | wired | Focus timer init from local defaults |
| Distraction blocking | not_available | Needs extension / OS hooks |
| Goals in picker | not_available | Waiting on Manifest wiring |

### General

| Setting | Status | What’s needed to wire |
| --- | --- | --- |
| Theme | wired | Existing color scheme (light/dark/hybrid/v2) |
| Language | not_available | No i18n yet |
| Time zone | wired | Detected display; override stored |
| Text size | not_implemented | Apply root typography scale |
| Reduced motion | not_implemented | Override OS preference |
| Captions | not_available | No caption track yet |
| Subscription / billing | wired | Plan + link to `/pricing` |
| Help & feedback | wired | Mailto |
| App version | wired | `VITE_APP_VERSION` or fallback |

---

## Storage

- `GET /settings` · `PATCH /settings` (partial)
- DynamoDB Users table attribute `appSettings` (versioned `UserSettingsV1`)
- Private-by-default server defaults in `backend/lambdas/_shared/user-settings.ts`
