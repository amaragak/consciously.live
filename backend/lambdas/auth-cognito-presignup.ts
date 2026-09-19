/**
 * Force emails to lowercase so Cognito aliases stay case-insensitive.
 */
type PreSignUpEvent = {
  userName?: string;
  request: {
    userAttributes?: Record<string, string>;
  };
  response: Record<string, unknown>;
};

function lower(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : value;
}

export async function handler(event: PreSignUpEvent): Promise<PreSignUpEvent> {
  const attrs = event.request.userAttributes ?? {};
  const email = lower(attrs.email);
  if (email) attrs.email = email;
  event.request.userAttributes = attrs;
  if (event.userName?.includes("@")) {
    event.userName = event.userName.trim().toLowerCase();
  }
  return event;
}
