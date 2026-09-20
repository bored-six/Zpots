import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const useAuthMock = vi.fn();
const signIn = vi.fn();
const signUp = vi.fn();
const signInWithGoogle = vi.fn();

let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    signIn: (...args: unknown[]) => signIn(...args),
    signUp: (...args: unknown[]) => signUp(...args),
    signInWithGoogle: (...args: unknown[]) => signInWithGoogle(...args),
  };
});

function setSearchParams(params: Record<string, string>) {
  searchParams = new URLSearchParams(params);
}

function codeError(code: string, message = code) {
  return Object.assign(new Error(message), { code });
}

beforeEach(() => {
  vi.clearAllMocks();
  setSearchParams({});
  useAuthMock.mockReturnValue({ status: "signed-out", user: null, signOut: vi.fn() });
  signInWithGoogle.mockResolvedValue(undefined);
});

async function renderLoginPage() {
  const Login = (await import("@/app/login/page")).default;
  return render(<Login />);
}

describe("Login page -- mode", () => {
  it("defaults to sign-in mode", async () => {
    await renderLoginPage();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
  });

  it("?mode=signup seeds sign-up mode", async () => {
    setSearchParams({ mode: "signup" });
    await renderLoginPage();

    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("toggling mode preserves the typed email and clears any error", async () => {
    signIn.mockRejectedValue(codeError("invalid_credentials"));
    const user = userEvent.setup();
    await renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), "person@example.com");
    await user.type(screen.getByLabelText(/^password/i), "wrongpass");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(screen.getByText(/incorrect/i)).toBeInTheDocument());

    await user.click(screen.getByText(/create an account/i));

    expect(screen.queryByText(/incorrect/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveValue("person@example.com");
  });
});

describe("Login page -- loading / redirect", () => {
  it("renders a disabled form while auth status is loading", async () => {
    useAuthMock.mockReturnValue({ status: "loading", user: null, signOut: vi.fn() });
    await renderLoginPage();

    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(screen.getByLabelText(/^password/i)).toBeDisabled();
  });

  it("redirects immediately (no form) when already signed in on mount", async () => {
    useAuthMock.mockReturnValue({ status: "signed-in", user: { id: "u1" }, signOut: vi.fn() });
    await renderLoginPage();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });
});

describe("Login page -- next param guard", () => {
  it("accepts a same-origin relative path", async () => {
    setSearchParams({ next: "/settings" });
    signIn.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.type(screen.getByLabelText(/^password/i), "password1");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/settings"));
  });

  it.each(["//evil.com", "https://evil.com", "/\\evil", "javascript:alert(1)"])(
    "falls back to / for an unsafe next value: %s",
    async (unsafeNext) => {
      setSearchParams({ next: unsafeNext });
      signIn.mockResolvedValue(undefined);
      const user = userEvent.setup();
      await renderLoginPage();

      await user.type(screen.getByLabelText(/email/i), "a@b.com");
      await user.type(screen.getByLabelText(/^password/i), "password1");
      await user.click(screen.getByRole("button", { name: /^sign in$/i }));

      await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    },
  );
});

describe("Login page -- sign-in", () => {
  it("submits trimmed/lower-cased email and redirects to next on success", async () => {
    signIn.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.type(screen.getByLabelText(/^password/i), "password1");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("shows the mapped error and preserves the typed password on wrong credentials", async () => {
    signIn.mockRejectedValue(codeError("invalid_credentials"));
    const user = userEvent.setup();
    await renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.type(screen.getByLabelText(/^password/i), "wrongpass");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(screen.getByText(/incorrect/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/^password/i)).toHaveValue("wrongpass");
  });

  it("a double-click on submit produces exactly one signIn call", async () => {
    let resolveSignIn!: () => void;
    signIn.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSignIn = resolve;
      }),
    );
    const user = userEvent.setup();
    await renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.type(screen.getByLabelText(/^password/i), "password1");
    const submit = screen.getByRole("button", { name: /signing in|^sign in$/i });
    await user.click(submit);
    await user.click(submit);

    resolveSignIn();
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("429 disables the submit button", async () => {
    signIn.mockRejectedValue({ status: 429, message: "rate limited" });
    const user = userEvent.setup();
    await renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.type(screen.getByLabelText(/^password/i), "password1");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(screen.getByText(/too many attempts/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeDisabled();
  });
});

describe("Login page -- sign-up", () => {
  it("user_already_exists / email_exists renders the sign-in toggle under the banner", async () => {
    setSearchParams({ mode: "signup" });
    signUp.mockRejectedValue(codeError("user_already_exists"));
    const user = userEvent.setup();
    await renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.type(screen.getByLabelText(/^password/i), "password1");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(screen.getByText(/already has an account/i)).toBeInTheDocument());
    expect(screen.getAllByText(/sign in/i).length).toBeGreaterThan(0);
  });

  it("needsEmailConfirmation: true renders the confirm-email state instead of redirecting", async () => {
    setSearchParams({ mode: "signup" });
    signUp.mockResolvedValue({ needsEmailConfirmation: true });
    const user = userEvent.setup();
    await renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), "new@example.com");
    await user.type(screen.getByLabelText(/^password/i), "password1");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(screen.getByText(/check your inbox/i)).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });

  it("needsEmailConfirmation: false redirects", async () => {
    setSearchParams({ mode: "signup" });
    signUp.mockResolvedValue({ needsEmailConfirmation: false });
    const user = userEvent.setup();
    await renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), "new@example.com");
    await user.type(screen.getByLabelText(/^password/i), "password1");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("enforces MIN_PASSWORD_LENGTH client-side before any network call", async () => {
    setSearchParams({ mode: "signup" });
    const user = userEvent.setup();
    await renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), "new@example.com");
    await user.type(screen.getByLabelText(/^password/i), "short");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(signUp).not.toHaveBeenCalled();
    expect(screen.getByText(/8 characters/i)).toBeInTheDocument();
  });

  it("does not enforce a minimum length in sign-in mode", async () => {
    signIn.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.type(screen.getByLabelText(/^password/i), "short");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(signIn).toHaveBeenCalled());
  });
});

describe("Login page -- Google sign-in", () => {
  it("renders a labeled Continue with Google button", async () => {
    await renderLoginPage();
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
  });

  it("clicking it calls signInWithGoogle with the current next path", async () => {
    setSearchParams({ next: "/settings" });
    const user = userEvent.setup();
    await renderLoginPage();

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(signInWithGoogle).toHaveBeenCalledWith("/settings");
  });

  it("falls back to / for an unsafe next value, same guard as the password flow", async () => {
    setSearchParams({ next: "https://evil.com" });
    const user = userEvent.setup();
    await renderLoginPage();

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(signInWithGoogle).toHaveBeenCalledWith("/");
  });

  it("shows a loading label and disables the button while the redirect is in flight", async () => {
    let resolveGoogle!: () => void;
    signInWithGoogle.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveGoogle = resolve;
      }),
    );
    const user = userEvent.setup();
    await renderLoginPage();

    const googleButton = screen.getByRole("button", { name: /continue with google/i });
    await user.click(googleButton);

    expect(screen.getByRole("button", { name: /redirecting/i })).toBeDisabled();

    resolveGoogle();
  });

  it("shows the mapped error and re-enables the button when signInWithGoogle rejects", async () => {
    signInWithGoogle.mockRejectedValue(codeError("provider_disabled", "Unsupported provider"));
    const user = userEvent.setup();
    await renderLoginPage();

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /continue with google/i })).not.toBeDisabled(),
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("does not disturb the email/password form or its existing button labels", async () => {
    await renderLoginPage();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
  });
});

describe("Login page -- copy", () => {
  it('never mentions "forgot" or "reset"', async () => {
    await renderLoginPage();
    expect(document.body.textContent).not.toMatch(/forgot/i);
    expect(document.body.textContent).not.toMatch(/reset/i);
  });

  it("in sign-up mode shows the 'password reset isn't available yet' helper line", async () => {
    setSearchParams({ mode: "signup" });
    await renderLoginPage();
    expect(screen.getByText(/isn.t available yet/i)).toBeInTheDocument();
  });

  it("inputs have correct type/autoComplete/labels", async () => {
    await renderLoginPage();

    const email = screen.getByLabelText(/email/i);
    const password = screen.getByLabelText(/^password/i);
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autoComplete", "email");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autoComplete", "current-password");
  });

  it("password field uses autoComplete=new-password in sign-up mode", async () => {
    setSearchParams({ mode: "signup" });
    await renderLoginPage();

    expect(screen.getByLabelText(/^password/i)).toHaveAttribute("autoComplete", "new-password");
  });
});
