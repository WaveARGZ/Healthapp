export const cloudConfig = {
  authDomain: process.env.NEXT_PUBLIC_BODYMAKE_AUTH_DOMAIN?.replace(/\/$/, "") ?? "",
  clientId: process.env.NEXT_PUBLIC_BODYMAKE_CLIENT_ID ?? "",
  apiUrl: process.env.NEXT_PUBLIC_BODYMAKE_API_URL?.replace(/\/$/, "") ?? "",
  callbackUrl: process.env.NEXT_PUBLIC_BODYMAKE_CALLBACK_URL ?? "",
  logoutUrl: process.env.NEXT_PUBLIC_BODYMAKE_LOGOUT_URL ?? "",
  googleSignInEnabled: process.env.NEXT_PUBLIC_BODYMAKE_GOOGLE_SIGN_IN_ENABLED === "true",
};

export const isCloudConfigured = Object.values(cloudConfig).every(Boolean);
