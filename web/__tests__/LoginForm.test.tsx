import { Activity } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { LoginForm } from "@/components/LoginForm";

// Fake router: we only check that push/refresh were called
const push = jest.fn();
const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

// Fake the API response for one test
function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as jest.Mock;
}

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "a@b.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "secret-123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));
}

beforeEach(() => jest.clearAllMocks());

describe("LoginForm", () => {
  it("sends email and password to the login API", async () => {
    mockFetch(200, {
      id: "u1",
      name: "Apra",
      email: "a@b.com",
      role: "ATTENDEE",
    });
    render(<LoginForm />);
    fillAndSubmit();

    await screen.findByRole("button", { name: "Logging in…" });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "a@b.com", password: "secret-123" }),
      }),
    );
  });

  it("goes home and refreshes after a successful login", async () => {
    mockFetch(200, {
      id: "u1",
      name: "Apra",
      email: "a@b.com",
      role: "ATTENDEE",
    });
    render(<LoginForm />);
    fillAndSubmit();

    await screen.findByRole("button", { name: "Logging in…" });
    await new Promise((r) => setTimeout(r, 0)); // let the fetch promise finish
    expect(push).toHaveBeenCalledWith("/");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the API's message on a wrong password", async () => {
    mockFetch(401, { error: "Invalid email or password" });
    render(<LoginForm />);
    fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid email or password",
    );
    expect(push).not.toHaveBeenCalled();
    // Button works again so they can retry
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
  });

  it("clears typed values and old errors when the page is hidden", async () => {
    mockFetch(401, { error: "Invalid email or password" });

    // Next.js (Cache Components) hides pages with <Activity> instead of removing them.
    // Simulate: show the page, hide it (user navigated away), show it again.
    const { rerender } = render(
      <Activity mode="visible">
        <LoginForm />
      </Activity>,
    );
    fillAndSubmit();
    await screen.findByRole("alert");

    rerender(
      <Activity mode="hidden">
        <LoginForm />
      </Activity>,
    );
    rerender(
      <Activity mode="visible">
        <LoginForm />
      </Activity>,
    );

    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});