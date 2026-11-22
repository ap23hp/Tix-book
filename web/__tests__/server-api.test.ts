import { cookies } from "next/headers";
import { ApiError } from "@/lib/api";
import { getBooking, getMyEvent, getMyEvents } from "@/lib/server-api";

jest.mock("next/headers", () => ({ cookies: jest.fn() }));

// Pretend the browser sent this cookie (or none)
function withCookie(token: string | undefined) {
  (cookies as jest.Mock).mockResolvedValue({
    get: (name: string) =>
      name === "session" && token ? { value: token } : undefined,
  });
}

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as jest.Mock;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.API_URL = "http://api.test";
});

describe("server-api", () => {
  it("forwards the session cookie to the API", async () => {
    withCookie("abc123");
    mockFetch(200, { events: [], nextCursor: null });

    await expect(getMyEvents()).resolves.toEqual({
      events: [],
      nextCursor: null,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://api.test/api/v1/events/mine?limit=50",
      expect.objectContaining({ headers: { Cookie: "session=abc123" } }),
    );
  });

  it("doesn't call the API without a session cookie", async () => {
    withCookie(undefined);
    mockFetch(200, {});

    await expect(getMyEvents()).rejects.toMatchObject({ status: 401 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns null for an event that isn't mine or doesn't exist (404)", async () => {
    withCookie("abc123");
    mockFetch(404, { error: "Event not found" });

    await expect(getMyEvent("e1")).resolves.toBeNull();
  });

  it("throws other errors, so the error page can show", async () => {
    withCookie("abc123");
    mockFetch(500, { error: "Something went wrong" });

    await expect(getMyEvent("e1")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("getBooking", () => {
  it("asks for my booking with the session cookie", async () => {
    withCookie("abc123");
    mockFetch(200, { id: "b1", status: "HELD" });

    await expect(getBooking("b1")).resolves.toMatchObject({ id: "b1" });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://api.test/api/v1/bookings/b1",
      expect.objectContaining({ headers: { Cookie: "session=abc123" } }),
    );
  });

  it("returns null when it isn't mine or doesn't exist (404)", async () => {
    withCookie("abc123");
    mockFetch(404, { error: "Booking not found" });
    await expect(getBooking("b1")).resolves.toBeNull();
  });
});
