import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/layout/Screen", () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

import PasswordResetConfirmScreen from "./PasswordResetConfirmScreen";

const fetchMock = vi.fn();
const policy = {
  minLength: 10,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  allowSpaces: false,
};

function renderConfirm(path = "/reset-password/confirm?tokenId=id-1&token=secret-token") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reset-password/confirm" element={<PasswordResetConfirmScreen />} />
        <Route path="/reset-password" element={<p>Request route</p>} />
        <Route path="/" element={<p>Sign in route</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function enterPasswords(password: string, confirmation = password) {
  fireEvent.change(screen.getByLabelText("New Password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm Password"), {
    target: { value: confirmation },
  });
}

describe("PasswordResetConfirmScreen", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/password/policy") {
        return { ok: true, json: async () => ({ policy, requirements: policy, tips: [] }) };
      }
      return { ok: true, json: async () => ({ success: true, message: "done" }) };
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("rejects a link without both token fields and routes to a new request", () => {
    renderConfirm("/reset-password/confirm?tokenId=id-1");
    expect(screen.getByRole("heading", { name: "Invalid Reset Link" })).toBeInTheDocument();
    expect(screen.queryByLabelText("New Password")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Request New Reset Link" }));
    expect(screen.getByText("Request route")).toBeInTheDocument();
  });

  it("shows policy progress, prevents mismatched submission, and submits matching passwords", async () => {
    renderConfirm();
    expect(await screen.findByText(/At least 10 characters/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset Password" })).toBeDisabled();

    enterPasswords("SecurePass1!", "different");
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset Password" })).toBeDisabled();

    enterPasswords("SecurePass1!");
    expect(screen.getByText("Passwords match")).toBeInTheDocument();
    const requirements = screen.getByText("Password requirements:").parentElement!;
    expect(within(requirements).getByText(/At least 10 characters/)).toHaveClass("text-green-600");
    expect(within(requirements).getByText(/Special character/)).toHaveClass("text-green-600");
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

    await screen.findByRole("heading", { name: "Password Reset Successfully" });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/password/reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokenId: "id-1", token: "secret-token", newPassword: "SecurePass1!" }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Go to Sign In" }));
    expect(screen.getByText("Sign in route")).toBeInTheDocument();
  });

  it("shows a server warning after a successful reset", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/auth/password/policy"
        ? { ok: true, json: async () => ({ policy }) }
        : {
            ok: true,
            json: async () => ({
              success: true,
              message: "done",
              warning: "Other sessions remain active",
            }),
          }
    );
    renderConfirm();
    await screen.findByText(/At least 10 characters/);
    enterPasswords("SecurePass1!");
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
    expect(await screen.findByText("Other sessions remain active")).toBeInTheDocument();
  });

  it("keeps the form available after a server rejection", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/auth/password/policy"
        ? { ok: true, json: async () => ({ policy }) }
        : { ok: false, json: async () => ({ error: "expired", message: "Link expired" }) }
    );
    renderConfirm();
    await screen.findByText(/At least 10 characters/);
    enterPasswords("SecurePass1!");
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
    expect(await screen.findByText("Link expired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset Password" })).toBeEnabled();
  });

  it("reports a network failure and resets the submitting state", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/password/policy") return { ok: true, json: async () => ({ policy }) };
      throw new Error("offline");
    });
    renderConfirm();
    await screen.findByText(/At least 10 characters/);
    enterPasswords("SecurePass1!");
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
    expect(await screen.findByText(/Network error/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reset Password" })).toBeEnabled()
    );
  });
});
