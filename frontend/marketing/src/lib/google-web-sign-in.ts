/**
 * Google Identity Services on the web → POST /auth/social.
 * Uses the native app's Google web OAuth client; this origin must be listed under
 * its Authorised JavaScript origins.
 *
 * GIS only hands out an ID token from its own button, so the page lays the
 * rendered Google button invisibly over the existing "Continue with Google" button.
 */
import { setMedimadeSession } from "@/lib/auth-session";
import {
  signInWithSocialIdToken,
  type MedimadeMagicLinkVerifyResult,
} from "@/lib/medimade-api";

const GIS_JS = "https://accounts.google.com/gsi/client";

type GoogleIdGlobal = {
  accounts: {
    id: {
      initialize: (opts: {
        client_id: string;
        callback: (res: { credential?: string }) => void;
        ux_mode?: "popup";
        use_fedcm_for_button?: boolean;
      }) => void;
      renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
    };
  };
};

let loading: Promise<GoogleIdGlobal> | null = null;

function loadGis(): Promise<GoogleIdGlobal> {
  const w = window as unknown as { google?: GoogleIdGlobal };
  if (w.google?.accounts?.id) return Promise.resolve(w.google);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_JS;
    script.async = true;
    script.onload = () =>
      w.google?.accounts?.id
        ? resolve(w.google)
        : reject(new Error("Google sign-in didn’t load"));
    script.onerror = () => {
      loading = null;
      reject(new Error("Google sign-in didn’t load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Renders the (invisible) Google button into `host`. Each successful pick
 * exchanges the ID token for a session and calls `onSession`.
 */
export async function mountGoogleWebButton(
  host: HTMLElement,
  clientId: string,
  handlers: {
    onStart: () => void;
    onSession: (session: MedimadeMagicLinkVerifyResult) => void;
    onError: (err: unknown) => void;
  },
): Promise<void> {
  const google = await loadGis();
  google.accounts.id.initialize({
    client_id: clientId,
    ux_mode: "popup",
    use_fedcm_for_button: true,
    callback: ({ credential }) => {
      if (!credential) {
        handlers.onError(new Error("Google didn’t return a sign-in. Try again."));
        return;
      }
      handlers.onStart();
      signInWithSocialIdToken({ provider: "google", idToken: credential })
        .then((session) => {
          setMedimadeSession(
            session.token,
            session.email,
            session.displayName,
            session.refreshToken ?? null,
          );
          handlers.onSession(session);
        })
        .catch(handlers.onError);
    },
  });
  host.replaceChildren();
  google.accounts.id.renderButton(host, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: "continue_with",
    width: Math.min(400, Math.max(200, Math.round(host.getBoundingClientRect().width))),
  });
}
