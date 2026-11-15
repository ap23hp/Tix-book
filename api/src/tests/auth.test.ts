import { describe, it, expect, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";

// A new email every run, so old test data never clashes
const email = `signup-test-${Date.now()}@example.com`;

afterAll(async () => {
  // Clean up the users these tests created in the dev database
  await prisma.user.deleteMany({
    where: { email: { startsWith: "signup-test-" } },
  });
  await prisma.$disconnect();
});

describe("POST /api/v1/auth/signup", () => {
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
    const response = await request(app)
      .post("/api/v1/auth/signup")
      .send({
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
