import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { createHash } from "node:crypto";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";

const runId = Date.now();

afterAll(async () => {
  // Deleting the users also deletes their sessions (onDelete: Cascade)
  await prisma.user.deleteMany({
    where: { email: { startsWith: "auth-test-" } },
  });
  await prisma.$disconnect();
});

describe("POST /api/v1/auth/signup", () => {
  const email = `auth-test-signup-${runId}@example.com`;

  it("creates a user and never returns the password hash", async () => {
    const response = await request(app)
      .post("/api/v1/auth/signup")
      .send({ name: "Test User", email, password: "correct-horse-1" });

    expect(response.status).toBe(201);
    expect(response.body.email).toBe(email);
    expect(response.body.role).toBe("ATTENDEE");
    expect(response.body).not.toHaveProperty("passwordHash");

    const saved = await prisma.user.findUnique({ where: { email } });
    expect(saved?.passwordHash).not.toBe("correct-horse-1");
    expect(saved?.passwordHash?.startsWith("$argon2id$")).toBe(true);
  });

  it("returns 409 for an email that is already registered", async () => {
    // Same email in capitals: should still count as the same account
    const response = await request(app).post("/api/v1/auth/signup").send({
      name: "Copy",
      email: email.toUpperCase(),
      password: "another-pass-1",
    });

    expect(response.status).toBe(409);
  });

  it("returns 400 with field errors for invalid data", async () => {
    const response = await request(app)
      .post("/api/v1/auth/signup")
      .send({ name: "", email: "not-an-email", password: "short" });

    expect(response.status).toBe(400);
    const fields = response.body.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(
      expect.arrayContaining(["name", "email", "password"]),
    );
  });
});

describe("POST /api/v1/auth/login", () => {
  const email = `auth-test-login-${runId}@example.com`;
  const password = "correct-horse-2";

  beforeAll(async () => {
    await request(app)
      .post("/api/v1/auth/signup")
      .send({ name: "Login User", email, password });
  });

  it("sets a secure session cookie and stores only the token's hash", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password });

    expect(response.status).toBe(200);
    expect(response.body.email).toBe(email);
    expect(response.body).not.toHaveProperty("passwordHash");

    const cookie = response.get("Set-Cookie")?.[0] ?? "";
    expect(cookie).toMatch(/^session=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");

    // The database has the hash of the token, not the token
    const token = cookie.match(/^session=([^;]+)/)?.[1] ?? "";
    const hashed = createHash("sha256").update(token).digest("hex");
    expect(
      await prisma.session.findUnique({ where: { id: hashed } }),
    ).not.toBeNull();
    expect(
      await prisma.session.findUnique({ where: { id: token } }),
    ).toBeNull();
  });

  it("returns 401 and no cookie for a wrong password", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "wrong-password" });

    expect(response.status).toBe(401);
    expect(response.get("Set-Cookie")).toBeUndefined();
  });

  it("gives the same answer for an email that doesn't exist", async () => {
    const wrongPassword = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "wrong-password" });
    const noSuchUser = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: `auth-test-nobody-${runId}@example.com`, password });

    expect(noSuchUser.status).toBe(401);
    expect(noSuchUser.body).toEqual(wrongPassword.body);
  });
});
describe("GET /api/v1/auth/me and POST /api/v1/auth/logout", () => {
  const email = `auth-test-session-${runId}@example.com`;
  const password = "correct-horse-3";
  let userId = "";

  // Logs in and returns just "session=<token>" for the Cookie header
  async function logIn(): Promise<string> {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password });
    return response.get("Set-Cookie")?.[0]?.split(";")[0] ?? "";
  }

  beforeAll(async () => {
    const response = await request(app)
      .post("/api/v1/auth/signup")
      .send({ name: "Session User", email, password });
    userId = response.body.id;
  });

  it("returns the user for a valid session", async () => {
    const cookie = await logIn();

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.email).toBe(email);
    expect(response.body).not.toHaveProperty("passwordHash");
  });

  it("returns 401 with no cookie", async () => {
    const response = await request(app).get("/api/v1/auth/me");
    expect(response.status).toBe(401);
  });

  it("returns 401 for a made-up token", async () => {
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", "session=not-a-real-token");
    expect(response.status).toBe(401);
  });

  it("returns 401 for an expired session and deletes it", async () => {
    const token = `expired-token-${runId}`;
    const id = createHash("sha256").update(token).digest("hex");
    await prisma.session.create({
      data: { id, userId, expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", `session=${token}`);

    expect(response.status).toBe(401);
    expect(await prisma.session.findUnique({ where: { id } })).toBeNull();
  });

  it("logout deletes the session, so the old cookie stops working", async () => {
    const cookie = await logIn();

    const logout = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookie);

    expect(logout.status).toBe(204);
    expect(logout.get("Set-Cookie")?.[0]).toContain("Expires=Thu, 01 Jan 1970");

    // Revocation: the same cookie is now useless
    const me = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(401);
  });
});
