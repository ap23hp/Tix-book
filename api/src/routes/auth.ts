import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import { signupSchema } from "../schemas/auth.js";

export const authRouter = Router();

// POST /api/v1/auth/signup → create an account (login comes next)
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

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "P2002"
  );
}
