/**
 * Cognito username/password from our own UI (no Hosted UI).
 * Public app client — USER_PASSWORD_AUTH is enabled on the pool.
 */

import {
  getMedimadeApiBase,
  medimadeFetch,
  type CognitoAuthConfig,
} from "@/lib/medimade-api";

type CognitoErrorBody = {
  __type?: string;
  message?: string;
};

export class CognitoIdpError extends Error {
  readonly type: string;

  constructor(type: string, message: string) {
    super(message);
    this.name = "CognitoIdpError";
    this.type = type;
  }
}

function errorType(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  const hash = t.lastIndexOf("#");
  return hash >= 0 ? t.slice(hash + 1) : t;
}

function friendlyMessage(type: string, fallback: string): string {
  switch (type) {
    case "NotAuthorizedException":
    case "UserNotFoundException":
      return "Incorrect email or password.";
    case "UsernameExistsException":
      return "An account with this email already exists. Sign in instead.";
    case "UserNotConfirmedException":
      return "Confirm your email to finish creating this account.";
    case "CodeMismatchException":
      return "That code isn’t right. Check the email and try again.";
    case "ExpiredCodeException":
      return "That code has expired. Request a new one.";
    case "InvalidPasswordException":
      return fallback || "Password needs 8+ characters, upper and lower case, and a number.";
    case "InvalidParameterException":
      return fallback || "Check your email and password and try again.";
    case "LimitExceededException":
    case "TooManyRequestsException":
      return "Too many attempts. Wait a moment and try again.";
    case "CodeDeliveryFailureException":
      return "We couldn’t send the email. Try again in a moment.";
    default:
      return fallback || "Something went wrong. Try again.";
  }
}

async function cognitoCall<T>(
  region: string,
  target: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as CognitoErrorBody & T;
  if (!res.ok) {
    const type = errorType(json.__type);
    throw new CognitoIdpError(
      type,
      friendlyMessage(type, typeof json.message === "string" ? json.message : ""),
    );
  }
  return json;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function requireClient(config: CognitoAuthConfig): {
  clientId: string;
  region: string;
} {
  const clientId = config.clientId?.trim() ?? "";
  const region = config.region?.trim() ?? "";
  if (!config.enabled || !clientId || !region) {
    throw new Error("Cognito sign-in is not configured yet");
  }
  return { clientId, region };
}

export type CognitoAuthTokens = {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
};

type AuthResult = {
  AuthenticationResult?: {
    IdToken?: string;
    AccessToken?: string;
    RefreshToken?: string;
  };
  ChallengeName?: string;
  Session?: string;
};

function tokensFromAuth(result: AuthResult): CognitoAuthTokens {
  const idToken = result.AuthenticationResult?.IdToken?.trim() ?? "";
  const accessToken = result.AuthenticationResult?.AccessToken?.trim() ?? "";
  if (!idToken || !accessToken) {
    const challenge = result.ChallengeName?.trim();
    if (challenge && challenge !== "PASSWORD") {
      throw new Error(
        `This account needs an extra step (${challenge}) that isn’t on this page yet. Try emailing a sign-in link.`,
      );
    }
    throw new Error("Cognito did not return a session. Try again.");
  }
  const refreshToken = result.AuthenticationResult?.RefreshToken?.trim();
  return {
    idToken,
    accessToken,
    refreshToken: refreshToken || undefined,
  };
}

export async function cognitoPasswordSignIn(
  config: CognitoAuthConfig,
  email: string,
  password: string,
): Promise<CognitoAuthTokens> {
  const { clientId, region } = requireClient(config);
  const result = await cognitoCall<AuthResult>(region, "InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: clientId,
    AuthParameters: {
      USERNAME: normalizeEmail(email),
      PASSWORD: password,
    },
  });
  return tokensFromAuth(result);
}

export async function cognitoSignUp(
  config: CognitoAuthConfig,
  email: string,
  password: string,
  name?: string,
): Promise<{ confirmed: boolean }> {
  const { clientId, region } = requireClient(config);
  const username = normalizeEmail(email);
  const attrs: { Name: string; Value: string }[] = [
    { Name: "email", Value: username },
  ];
  const trimmedName = name?.trim();
  if (trimmedName) {
    attrs.push({ Name: "name", Value: trimmedName });
  }
  const result = await cognitoCall<{ UserConfirmed?: boolean }>(
    region,
    "SignUp",
    {
      ClientId: clientId,
      Username: username,
      Password: password,
      UserAttributes: attrs,
    },
  );
  return { confirmed: result.UserConfirmed === true };
}

export async function cognitoConfirmSignUp(
  config: CognitoAuthConfig,
  email: string,
  code: string,
): Promise<void> {
  const { clientId, region } = requireClient(config);
  await cognitoCall(region, "ConfirmSignUp", {
    ClientId: clientId,
    Username: normalizeEmail(email),
    ConfirmationCode: code.trim(),
  });
}

export async function cognitoResendSignUpCode(
  config: CognitoAuthConfig,
  email: string,
): Promise<void> {
  const username = normalizeEmail(email);
  const base = getMedimadeApiBase();
  if (base) {
    const res = await medimadeFetch(`${base}/auth/cognito/resend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: username }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      throw new Error(data.error || "Could not resend the code.");
    }
    return;
  }
  const { clientId, region } = requireClient(config);
  await cognitoCall(region, "ResendConfirmationCode", {
    ClientId: clientId,
    Username: username,
  });
}

export async function cognitoForgotPassword(
  config: CognitoAuthConfig,
  email: string,
): Promise<void> {
  const { clientId, region } = requireClient(config);
  await cognitoCall(region, "ForgotPassword", {
    ClientId: clientId,
    Username: normalizeEmail(email),
  });
}

export async function cognitoConfirmForgotPassword(
  config: CognitoAuthConfig,
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  const { clientId, region } = requireClient(config);
  await cognitoCall(region, "ConfirmForgotPassword", {
    ClientId: clientId,
    Username: normalizeEmail(email),
    ConfirmationCode: code.trim(),
    Password: newPassword,
  });
}

export function isUnconfirmedUserError(err: unknown): boolean {
  return err instanceof CognitoIdpError && err.type === "UserNotConfirmedException";
}

export function isUsernameExistsError(err: unknown): boolean {
  return err instanceof CognitoIdpError && err.type === "UsernameExistsException";
}
