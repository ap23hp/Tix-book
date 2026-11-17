import { Google } from "arctic";

// Created on first use, so the rest of the API (and the tests) still work
// on a machine where the Google settings aren't filled in yet.
let google: Google | undefined;

export function getGoogle(): Google {
  if (google) return google;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google login is not set up: add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI to the environment",
    );
  }

  google = new Google(clientId, clientSecret, redirectUri);
  return google;
}