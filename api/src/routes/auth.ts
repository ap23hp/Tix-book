import { Router, type CookieOptions, type Response } from "express";
import {
  ArcticFetchError,
  OAuth2RequestError,
  decodeIdToken,
  generateCodeVerifier,
  generateState,
} from "arctic";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  SESSION_COOKIE,
  clearSessionCookieOptions,
  createSession,
  invalidateSession,
  sessionCookieOptions,
} from "../lib/session.js";
import { getGoogle } from "../lib/google.js";
import { findOrCreateGoogleUser } from "../lib/google-user.js";
import { getUser, requireAuth } from "../middleware/auth.js";
import {
  googleClaimsSchema,
  loginSchema,
  signupSchema,
} from "../schemas/auth.js";
import { HttpError, parseOrThrow } from "../lib/errors.js";
export const authRouter = Router();

// POST /api/v1/auth/signup → create an account
authRouter.post("/signup", async (req, res) => {
  // Invalid body → throws 400 { error, details } (see lib/errors.ts)
  const { name, email, password, role } = parseOrThrow(
    signupSchema,
    req.body,
    "Invalid sign-up data",
  );
  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role },
      // Never send the hash back
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    res.status(201).json(user);
  } catch (err) {
    // P2002 = a unique column (email) already has this value
    if (isUniqueConstraintError(err)) {
      throw new HttpError(409, "An account with this email already exists");
    }
    throw err; // anything else → errorHandler → 500
  }
});
// Used when the email doesn't exist, so a wrong email takes
// as long as a wrong password (attackers can't time the difference)
const dummyHash = hashPassword("not-a-real-password");

// POST /api/v1/auth/login → check password, create session, set cookie
authRouter.post("/login", async (req, res) => {
  const { email, password } = parseOrThrow(
    loginSchema,
    req.body,
    "Invalid login data",
  );
  const user = await prisma.user.findUnique({ where: { email } });

  // Always run verify, even with no user, so timing looks the same
  const hash = user?.passwordHash ?? (await dummyHash);
  const passwordOk = await verifyPassword(hash, password);

  // Same message for wrong email and wrong password
  if (!user || !user.passwordHash || !passwordOk) {
    throw new HttpError(401, "Invalid email or password");
  }

  const { token, expiresAt } = await createSession(user.id);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));

  res.status(200).json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
});
// GET /api/v1/auth/me → who is logged in?
authRouter.get("/me", requireAuth, (_req, res) => {
  res.status(200).json(getUser(res));
});

// POST /api/v1/auth/logout → delete the session and the cookie
authRouter.post("/logout", async (req, res) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];

  if (typeof token === "string") {
    await invalidateSession(token);
  }

  res.clearCookie(SESSION_COOKIE, clearSessionCookieOptions());
  res.status(204).end();
});

// ---------- Google login (OAuth 2.0 authorization code flow + PKCE) ----------

const GOOGLE_STATE_COOKIE = "google_oauth_state";
const GOOGLE_VERIFIER_COOKIE = "google_code_verifier";

// Short-lived cookies, only sent to the Google routes below.
// sameSite "lax" (not "strict"): the browser must send them when Google
// redirects back to us, which is a top-level navigation from another site.
const googleCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/api/v1/auth/google",
};

function clearGoogleCookies(res: Response) {
  res.clearCookie(GOOGLE_STATE_COOKIE, googleCookieOptions);
  res.clearCookie(GOOGLE_VERIFIER_COOKIE, googleCookieOptions);
}

// Relative URLs ("/", "/login") stay on whatever site the browser is on
// (tix-book.vercel.app or localhost:3000), because requests come through the rewrite.
function failGoogleLogin(res: Response, reason: string) {
  clearGoogleCookies(res);
  res.redirect(302, `/login?error=${reason}`);
}

// GET /api/v1/auth/google → send the browser to Google's sign-in page
authRouter.get("/google", (_req, res) => {
  const state = generateState(); // stops another site starting a login for you (CSRF)
  const codeVerifier = generateCodeVerifier(); // PKCE: proves we started this login

  const url = getGoogle().createAuthorizationURL(state, codeVerifier, [
    "openid",
    "profile",
    "email",
  ]);

  const tenMinutes = 10 * 60 * 1000;
  res.cookie(GOOGLE_STATE_COOKIE, state, {
    ...googleCookieOptions,
    maxAge: tenMinutes,
  });
  res.cookie(GOOGLE_VERIFIER_COOKIE, codeVerifier, {
    ...googleCookieOptions,
    maxAge: tenMinutes,
  });

  res.set("Cache-Control", "no-store");
  res.redirect(302, url.toString());
});

// GET /api/v1/auth/google/callback → Google sends the browser back here
authRouter.get("/google/callback", async (req, res) => {
  res.set("Cache-Control", "no-store");

  const { code, state } = req.query;
  const storedState: unknown = req.cookies?.[GOOGLE_STATE_COOKIE];
  const codeVerifier: unknown = req.cookies?.[GOOGLE_VERIFIER_COOKIE];

  // Missing pieces, the user pressed Cancel, or state doesn't match our cookie
  if (
    typeof code !== "string" ||
    typeof state !== "string" ||
    typeof storedState !== "string" ||
    typeof codeVerifier !== "string" ||
    state !== storedState
  ) {
    failGoogleLogin(res, "google");
    return;
  }

  // Swap the one-time code for tokens (server to server, with our secret)
  let idToken: string;
  try {
    const tokens = await getGoogle().validateAuthorizationCode(
      code,
      codeVerifier,
    );
    idToken = tokens.idToken();
  } catch (err) {
    // Bad/expired code, or Google couldn't be reached
    if (err instanceof OAuth2RequestError || err instanceof ArcticFetchError) {
      failGoogleLogin(res, "google");
      return;
    }
    throw err;
  }

  // The ID token came straight from Google over HTTPS, so decoding it
  // (without checking the signature) is safe here.
  const claims = googleClaimsSchema.safeParse(decodeIdToken(idToken));
  if (!claims.success) {
    failGoogleLogin(res, "google");
    return;
  }

  const result = await findOrCreateGoogleUser(claims.data);
  if (!result.ok) {
    failGoogleLogin(res, result.reason);
    return;
  }

  // From here it's the same as a password login
  clearGoogleCookies(res);
  const { token, expiresAt } = await createSession(result.userId);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  res.redirect(302, "/");
});

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "P2002"
  );
}