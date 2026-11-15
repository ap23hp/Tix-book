import { fireEvent, render, screen } from "@testing-library/react";
import { SignupForm } from "@/components/SignupForm";

const push = jest.fn();
const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Apra" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "a@b.com" },
  });
  fireEvent.change(screen.getByLabelText(/^Password/), {
    target: { value: "secret-123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

beforeEach(() => jest.clearAllMocks());

describe("SignupForm", () => {
  it("shows 'email taken' when the API returns 409", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        response(409, { error: "An account with this email already exists" }),
      ) as jest.Mock;
    render(<SignupForm />);
    fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An account with this email already exists",
    );
  });

  it("shows a field error next to the field on a 400", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      response(400, {
        error: "Invalid sign-up data",
        details: [{ field: "password", message: "Too short" }],
      }),
    ) as jest.Mock;
    render(<SignupForm />);
    fillAndSubmit();

    expect(await screen.findByText("Too short")).toBeInTheDocument();
    // The error is linked to the input, for screen readers
    expect(screen.getByLabelText(/^Password/)).toHaveAccessibleDescription(
      "Too short",
    );
  });

  it("signs up, then logs in, then goes home", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(response(201, { id: "u1" })) // signup
      .mockResolvedValueOnce(response(200, { id: "u1" })) as jest.Mock; // login
    render(<SignupForm />);
    fillAndSubmit();

    await screen.findByRole("button", { name: "Creating account…" });
    await new Promise((r) => setTimeout(r, 0));
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/auth/signup",
      expect.anything(),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/auth/login",
      expect.anything(),
    );
    expect(push).toHaveBeenCalledWith("/");
  });
});
