import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { findOrCreateGoogleUser } from "../lib/google-user.js";
import { hashPassword } from "../lib/password.js";

const runId = Date.now();

beforeAll(() => {
  // Fake settings: these tests never talk to Google
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.GOOGLE_REDIRECT_URI =
    "http://localhost:3000/api/v1/auth/google/callback";
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { email: { startsWith: "google-test-" } },
  });
  await prisma.$disconnect();
});

describe("GET /api/v1/auth/google", () => {
  it("redirects to Google and sets the state and verifier cookies", async () => {
    const response = await request(app).get("/api/v1/auth/google");

    expect(response.status).toBe(302);
    const location = new URL(response.headers.location ?? "");
    expect(location.hostname).toBe("accounts.google.com");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");

    const cookies = String(response.headers["set-cookie"]);
    expect(cookies).toContain("google_oauth_state=");
    expect(cookies).toContain("google_code_verifier=");
    expect(cookies).toContain("HttpOnly");
  });
});

describe("GET /api/v1/auth/google/callback", () => {
  it("rejects a state that doesn't match the cookie", async () => {
    const response = await request(app)
      .get("/api/v1/auth/google/callback?code=abc&state=attacker")
      .set("Cookie", [
        "google_oauth_state=real-state",
        "google_code_verifier=verifier",
      ]);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/login?error=google");
    expect(String(response.headers["set-cookie"])).not.toContain("session=");
  });

  it("rejects a callback with no cookies (login not started here)", async () => {
    const response = await request(app).get(
      "/api/v1/auth/google/callback?code=abc&state=abc",
    );

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/login?error=google");
  });
});

describe("findOrCreateGoogleUser", () => {
  it("creates a new attendee, then finds the same user next time", async () => {
    const claims = {
      sub: `google-sub-new-${runId}`,
      email: `google-test-new-${runId}@example.com`,
      email_verified: true as const,
      name: "Google Person",
    };

    const first = await findOrCreateGoogleUser(claims);
    const second = await findOrCreateGoogleUser(claims);

    expect(first.ok).toBe(true);
    expect(second).toEqual(first);

    const user = await prisma.user.findUnique({
      where: { email: claims.email },
    });
    expect(user?.role).toBe("ATTENDEE");
    expect(user?.passwordHash).toBeNull();
  });

  it("refuses to link to an existing password account (pre-account hijacking)", async () => {
    const email = `google-test-password-${runId}@example.com`;
    await prisma.user.create({
      data: {
        name: "Has Password",
        email,
        passwordHash: await hashPassword("someone-elses-pass"),
        role: "ATTENDEE",
      },
    });

    const result = await findOrCreateGoogleUser({
      sub: `google-sub-victim-${runId}`,
      email,
      email_verified: true,
    });

    expect(result).toEqual({ ok: false, reason: "account-exists" });
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.googleId).toBeNull();
  });
});