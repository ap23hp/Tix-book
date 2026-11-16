import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  SESSION_COOKIE,
  clearSessionCookieOptions,
  createSession,
  invalidateSession,
  sessionCookieOptions,
} from "../lib/session.js";
import { getUser, requireAuth } from "../middleware/auth.js";
import { loginSchema, signupSchema } from "../schemas/auth.js";

export const authRouter = Router();

// POST /api/v1/auth/signup → create an account
authRouter.post("/signup", async (req, res) => {
  const result = signupSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Invalid sign-up data",
      details: result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  const { name, email, password, role } = result.data;
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
      res
        .status(409)
        .json({ error: "An account with this email already exists" });
      return;
    }
    throw err; // anything else → errorHandler → 500
  }
});

// Used when the email doesn't exist, so a wrong email takes
// as long as a wrong password (attackers can't time the difference)
const dummyHash = hashPassword("not-a-real-password");

// POST /api/v1/auth/login → check password, create session, set cookie
authRouter.post("/login", async (req, res) => {
  const result = loginSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Invalid login data",
      details: result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  const { email, password } = result.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Always run verify, even with no user, so timing looks the same
  const hash = user?.passwordHash ?? (await dummyHash);
  const passwordOk = await verifyPassword(hash, password);

  // Same message for wrong email and wrong password
  if (!user || !user.passwordHash || !passwordOk) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
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
function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "P2002"
  );
}
