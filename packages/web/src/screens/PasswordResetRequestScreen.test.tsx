import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/layout/Screen", () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

import PasswordResetRequestScreen from "./PasswordResetRequestScreen";

const fetchMock = vi.fn();

function renderRequest() {
  return render(
    <MemoryRouter initialEntries={["/reset-password"]}>
      <Routes>
        <Route path="/reset-password" element={<PasswordResetRequestScreen />} />
        <Route path="/sign-in" element={<p>Sign in route</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function submit(email = "rider@example.com") {
  fireEvent.change(screen.getByRole("textbox", { name: "Email Address" }), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));
}

describe("PasswordResetRequestScreen", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("submits the address and shows the non-disclosing success message", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: "sent" }),
    });
    renderRequest();
    submit();

    await screen.findByRole("heading", { name: "Check Your Email" });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "rider@example.com" }),
    });
    expect(screen.getByText(/if an account exists with/i)).toHaveTextContent("rider@example.com");
    expect(screen.getByText(/expire in 1 hour/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Sign In" })).toBeInTheDocument();
  });

  it("shows the first validation detail returned by the server and allows retry", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: "Invalid request",
        details: [{ path: ["email"], message: "Use a valid email" }],
      }),
    });
    renderRequest();
    submit();

    expect(await screen.findByText("Use a valid email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Reset Link" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Check Your Email" })).not.toBeInTheDocument();
  });

  it("shows the server error when no validation details are supplied", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Too many requests" }) });
    renderRequest();
    submit();
    expect(await screen.findByText("Too many requests")).toBeInTheDocument();
  });

  it("recovers from a network failure and lets the rider submit again", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, message: "sent" }),
    });
    renderRequest();
    submit();
    expect(await screen.findByText(/Network error/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Check Your Email" })).toBeInTheDocument()
    );
  });
});
