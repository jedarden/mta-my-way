/**
 * Password Reset Confirmation Screen
 *
 * Screen for confirming a password reset with a token from the email link.
 * Users enter their new password and confirm it.
 */

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "../components/layout/Header";
import { Screen } from "../components/layout/Screen";

interface PasswordResetConfirmResponse {
  success: boolean;
  message: string;
  warning?: string;
}

interface ErrorResponse {
  error: string;
  message?: string;
  errors?: string[];
}

interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  allowSpaces: boolean;
}

interface PasswordPolicyResponse {
  policy: PasswordPolicy;
  requirements: PasswordPolicy;
  tips: string[];
}

export function PasswordResetConfirmScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenId = searchParams.get("tokenId");
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy | null>(null);
  const [passwordValidation, setPasswordValidation] = useState({
    hasMinLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    hasSpecial: false,
    passwordsMatch: false,
  });

  // Check if token is valid
  const isValidLink = tokenId && token;

  useEffect(() => {
    // Fetch password policy
    const fetchPolicy = async () => {
      try {
        const response = await fetch("/api/auth/password/policy");
        if (response.ok) {
          const data: PasswordPolicyResponse = await response.json();
          setPasswordPolicy(data.policy);
        }
      } catch (error) {
        console.error("Failed to fetch password policy", error);
      }
    };

    fetchPolicy();
  }, []);

  // Validate password as user types
  useEffect(() => {
    if (!passwordPolicy) return;

    const validation = {
      hasMinLength: newPassword.length >= passwordPolicy.minLength,
      hasUppercase: /[A-Z]/.test(newPassword),
      hasLowercase: /[a-z]/.test(newPassword),
      hasNumber: /\d/.test(newPassword),
      hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword),
      passwordsMatch: confirmPassword !== "" && newPassword === confirmPassword,
    };

    setPasswordValidation(validation);
  }, [newPassword, confirmPassword, passwordPolicy]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");
    setWarningMessage("");

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tokenId,
          token,
          newPassword,
        }),
      });

      const data: PasswordResetConfirmResponse | ErrorResponse = await response.json();

      if (!response.ok) {
        const errorData = data as ErrorResponse;
        setErrorMessage(
          errorData.message ||
            errorData.error ||
            "Failed to reset password. The link may be invalid or expired."
        );
        return;
      }

      const resetData = data as PasswordResetConfirmResponse;
      if (resetData.success) {
        // Set warning message if present
        if (resetData.warning) {
          setWarningMessage(resetData.warning);
        }
        setSubmitSuccess(true);
      }
    } catch (error) {
      setErrorMessage("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show error if link is invalid
  if (!isValidLink && !submitSuccess) {
    return (
      <Screen>
        <Header title="Reset Password" />
        <div className="max-w-md mx-auto px-4 py-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-red-600 dark:text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Invalid Reset Link
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              This password reset link is invalid or has expired. Please request a new password
              reset.
            </p>
            <button
              type="button"
              onClick={() => navigate("/reset-password")}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
            >
              Request New Reset Link
            </button>
          </div>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Reset Password" showBack={!submitSuccess} />

      <div className="max-w-md mx-auto px-4 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          {!submitSuccess ? (
            <>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Enter your new password below.
              </p>

              {passwordPolicy && (
                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Password requirements:
                  </p>
                  <ul className="text-sm space-y-1">
                    <li
                      className={
                        passwordValidation.hasMinLength
                          ? "text-green-600 dark:text-green-400"
                          : "text-gray-500 dark:text-gray-400"
                      }
                    >
                      {passwordValidation.hasMinLength ? "✓" : "•"} At least{" "}
                      {passwordPolicy.minLength} characters
                    </li>
                    <li
                      className={
                        passwordValidation.hasUppercase
                          ? "text-green-600 dark:text-green-400"
                          : "text-gray-500 dark:text-gray-400"
                      }
                    >
                      {passwordValidation.hasUppercase ? "✓" : "•"} Uppercase letter (A-Z)
                    </li>
                    <li
                      className={
                        passwordValidation.hasLowercase
                          ? "text-green-600 dark:text-green-400"
                          : "text-gray-500 dark:text-gray-400"
                      }
                    >
                      {passwordValidation.hasLowercase ? "✓" : "•"} Lowercase letter (a-z)
                    </li>
                    <li
                      className={
                        passwordValidation.hasNumber
                          ? "text-green-600 dark:text-green-400"
                          : "text-gray-500 dark:text-gray-400"
                      }
                    >
                      {passwordValidation.hasNumber ? "✓" : "•"} Number (0-9)
                    </li>
                    <li
                      className={
                        passwordValidation.hasSpecial
                          ? "text-green-600 dark:text-green-400"
                          : "text-gray-500 dark:text-gray-400"
                      }
                    >
                      {passwordValidation.hasSpecial ? "✓" : "•"} Special character (!@#$%^&*)
                    </li>
                  </ul>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="newPassword"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    New Password
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    placeholder="Enter new password"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    placeholder="Confirm new password"
                  />
                  {confirmPassword && (
                    <p
                      className={`mt-1 text-sm ${passwordValidation.passwordsMatch ? "text-green-600" : "text-red-600"}`}
                    >
                      {passwordValidation.passwordsMatch
                        ? "Passwords match"
                        : "Passwords do not match"}
                    </p>
                  )}
                </div>

                {errorMessage && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
                    {errorMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    newPassword.length === 0 ||
                    confirmPassword.length === 0 ||
                    !passwordValidation.passwordsMatch
                  }
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2.5 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  {isSubmitting ? "Resetting..." : "Reset Password"}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Password Reset Successfully
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Your password has been reset. You can now sign in with your new password.
              </p>
              {warningMessage && (
                <div className="mb-6 mx-auto max-w-md">
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 px-4 py-3 rounded-lg text-left">
                    <p className="text-sm">{warningMessage}</p>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => navigate("/")}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
              >
                Go to Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </Screen>
  );
}

export default PasswordResetConfirmScreen;
