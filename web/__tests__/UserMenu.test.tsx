import { render, screen } from "@testing-library/react";
import { getCurrentUser } from "@/lib/auth";
import { UserMenu } from "@/components/UserMenu";

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("next/navigation", () => ({
  ...jest.requireActual("next/navigation"),
  // LogoutButton needs a router
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

const mockUser = getCurrentUser as jest.Mock;

// UserMenu is an async Server Component. Jest can't render those directly,
// so await the function to get its JSX, then render that.
async function renderMenu() {
  render(await UserMenu());
}

beforeEach(() => jest.clearAllMocks());

describe("UserMenu", () => {
  it("shows Log in when nobody is logged in", async () => {
    mockUser.mockResolvedValue(null);
    await renderMenu();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("shows the organiser's links and name", async () => {
    mockUser.mockResolvedValue({
      id: "u1",
      name: "Apra",
      email: "a@b.com",
      role: "ORGANISER",
    });
    await renderMenu();
    expect(screen.getByRole("link", { name: "My events" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hi, Apra" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("shows a plain Account link when the API can't be reached, instead of throwing", async () => {
    // What getCurrentUser does when Render is asleep: the fetch fails
    mockUser.mockRejectedValue(new TypeError("fetch failed"));

    await expect(renderMenu()).resolves.toBeUndefined(); // didn't throw
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(
      screen.queryByRole("link", { name: "Log in" }),
    ).not.toBeInTheDocument();
  });

  it("lets Next.js's own errors through (e.g. redirect)", async () => {
    // A Next.js internal error must not be swallowed by the fallback
    const { redirect } = jest.requireActual("next/navigation");
    let nextError: unknown;
    try {
      redirect("/login");
    } catch (error) {
      nextError = error;
    }
    mockUser.mockRejectedValue(nextError);

    await expect(UserMenu()).rejects.toBe(nextError);
  });
});
