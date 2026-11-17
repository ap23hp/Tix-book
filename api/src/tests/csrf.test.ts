import { describe, it, expect } from "@jest/globals";
import request from "supertest";
import app from "../app.js";

// Logout is a POST that needs no login, so it's an easy write to test with
describe("blockCrossSiteWrites (CSRF defence)", () => {
  it("blocks a POST started by another website", async () => {
    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Sec-Fetch-Site", "cross-site");

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Cross-site request blocked");
  });

  it("allows a POST from our own pages", async () => {
    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Sec-Fetch-Site", "same-origin");

    expect(response.status).toBe(204);
  });

  it("allows a POST with no header (not a browser)", async () => {
    const response = await request(app).post("/api/v1/auth/logout");

    expect(response.status).toBe(204);
  });

  it("never blocks GET requests (they must not change data anyway)", async () => {
    const response = await request(app)
      .get("/health")
      .set("Sec-Fetch-Site", "cross-site");

    expect(response.status).toBe(200);
  });
});