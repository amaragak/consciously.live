/**
 * Account-owned Secrets Manager names (not stack-owned).
 * Create these before deploy — see backend/DEPLOY.md.
 */
export const FISH_AUDIO_SECRET_NAME = "medimade/FISH_AUDIO_API_KEY";
export const SPEECHIFY_SECRET_NAME = "medimade/SPEECHIFY_API_KEY";
export const CLAUDE_SECRET_NAME = "medimade/CLAUDE_API_KEY";
export const OPENAI_SECRET_NAME = "medimade/OPENAI_API_KEY";
export const GOOGLE_AI_SECRET_NAME = "medimade/GOOGLE_AI_API_KEY";
export const BREVO_SECRET_NAME = "medimade/BREVO_API_KEY";
export const RUNPODS_SECRET_NAME = "medimade/RUNPODS_API_KEY";
export const RUNPODS_URL_SECRET_NAME = "medimade/RUNPODS_URL";
export const ALGOLIA_SECRET_NAME = "medimade/ALGOLIA";
/** Stripe secret API key (sk_…). */
export const STRIPE_SECRET_NAME = "medimade/STRIPE_SECRET_KEY";
/** Stripe webhook signing secret (whsec_…). */
export const STRIPE_WEBHOOK_SECRET_NAME = "medimade/STRIPE_WEBHOOK_SECRET";
/**
 * JSON: `{"create":"price_…","pro":"price_…","essentials":"price_…"}`
 * Price IDs are not highly sensitive but live with other Stripe config in SM.
 */
export const STRIPE_PRICES_SECRET_NAME = "medimade/STRIPE_PRICES";
