import { describe, it, expect } from "@jest/globals";
import request from "supertest";
import app from "../app.js";

// Every error response has the same shape: { error, details? }
describe("error format", () => {
  it("unknown route → 404 { error }", async () => {
    const response = await request(app).get("/api/v1/nope");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Not found" });
  });

  it("broken JSON → 400 { error }", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{ not json");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Invalid JSON in request body" });
  });

  it("validation error → 400 { error, details: [{ field, message }] }", async () => {
    const response = await request(app)
      .post("/api/v1/auth/signup")
      .send({ name: "", email: "nope", password: "x" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid sign-up data");
    expect(response.body.details[0]).toEqual({
      field: expect.any(String),
      message: expect.any(String),
    });
  });
});