import { postJson, sendJson } from "@/lib/client-api";

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as jest.Mock;
}

beforeEach(() => jest.clearAllMocks());

describe("sendJson", () => {
  it("sends the method and a JSON body", async () => {
    mockFetch(200, { id: "e1" });

    const result = await sendJson("PATCH", "/api/v1/events/e1", {
      title: "New",
    });

    expect(result).toEqual({ ok: true, data: { id: "e1" } });
    expect(global.fetch).toHaveBeenCalledWith("/api/v1/events/e1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New" }),
    });
  });

  it("turns the API's details into one message per field", async () => {
    mockFetch(400, {
      error: "Invalid event data",
      details: [
        { field: "endsAt", message: "End time must be after start time" },
        { field: "endsAt", message: "A second message for the same field" },
      ],
    });

    const result = await sendJson("PATCH", "/api/v1/events/e1", {});

    expect(result).toEqual({
      ok: false,
      status: 400,
      message: "Invalid event data",
      fieldErrors: { endsAt: "End time must be after start time" },
    });
  });

  it("says the server couldn't be reached when the network fails", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("offline"));

    const result = await sendJson("POST", "/api/v1/events", {});

    expect(result).toMatchObject({ ok: false, status: 0 });
  });

  it("postJson is sendJson with POST", async () => {
    mockFetch(201, { id: "e2" });
    await postJson("/api/v1/events", {});
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/events",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
