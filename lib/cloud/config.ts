export const isTestEnvironment = process.env.NEXT_PUBLIC_BODYMAKE_ENV === "test";

// A test build never falls back to production Cognito/API settings from .env.local.
export const cloudConfig = isTestEnvironment ? {
  authDomain: process.env.NEXT_PUBLIC_BODYMAKE_TEST_AUTH_DOMAIN?.replace(/\/$/, "") ?? "",
  clientId: process.env.NEXT_PUBLIC_BODYMAKE_TEST_CLIENT_ID ?? "",
  apiUrl: process.env.NEXT_PUBLIC_BODYMAKE_TEST_API_URL?.replace(/\/$/, "") ?? "",
  callbackUrl: process.env.NEXT_PUBLIC_BODYMAKE_TEST_CALLBACK_URL ?? "http://localhost:3001/auth/callback/",
  logoutUrl: process.env.NEXT_PUBLIC_BODYMAKE_TEST_LOGOUT_URL ?? "http://localhost:3001/bodymake",
  googleSignInEnabled: process.env.NEXT_PUBLIC_BODYMAKE_TEST_GOOGLE_SIGN_IN_ENABLED === "true",
} : {
  authDomain: process.env.NEXT_PUBLIC_BODYMAKE_AUTH_DOMAIN?.replace(/\/$/, "") ?? "",
  clientId: process.env.NEXT_PUBLIC_BODYMAKE_CLIENT_ID ?? "",
  apiUrl: process.env.NEXT_PUBLIC_BODYMAKE_API_URL?.replace(/\/$/, "") ?? "",
  callbackUrl: process.env.NEXT_PUBLIC_BODYMAKE_CALLBACK_URL ?? "",
  logoutUrl: process.env.NEXT_PUBLIC_BODYMAKE_LOGOUT_URL ?? "",
  googleSignInEnabled: process.env.NEXT_PUBLIC_BODYMAKE_GOOGLE_SIGN_IN_ENABLED === "true",
};

const hasSeparateTestBackend = !isTestEnvironment || (
  (!process.env.NEXT_PUBLIC_BODYMAKE_API_URL || cloudConfig.apiUrl !== process.env.NEXT_PUBLIC_BODYMAKE_API_URL.replace(/\/$/, "")) &&
  (!process.env.NEXT_PUBLIC_BODYMAKE_AUTH_DOMAIN || cloudConfig.authDomain !== process.env.NEXT_PUBLIC_BODYMAKE_AUTH_DOMAIN.replace(/\/$/, ""))
);

export const isCloudConfigured = hasSeparateTestBackend && Boolean(
  cloudConfig.authDomain && cloudConfig.clientId && cloudConfig.apiUrl && cloudConfig.callbackUrl && cloudConfig.logoutUrl,
);
