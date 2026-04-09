/**
 * MfaSettingsScreen - Multi-factor authentication settings screen.
 *
 * Allows users to manage their MFA settings, enable/disable TOTP, and view status.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Screen from "../components/layout/Screen";
import { useMFA } from "../hooks/useMFA";

interface MfaStatus {
  enabled: boolean;
  verified: boolean;
}

export default function MfaSettingsScreen() {
  const { isLoading, error, getStatus, disableTotp } = useMFA();
  const navigate = useNavigate();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [showDisableConfirm, setShowDisableConfirm] = useState<boolean>(false);
  const [disabling, setDisabling] = useState<boolean>(false);

  useEffect(() => {
    const loadStatus = async (): Promise<void> => {
      const result = await getStatus();
      if (result) {
        setStatus(result);
      }
    };
    void loadStatus();
  }, [getStatus]);

  const handleDisableMfa = async (): Promise<void> => {
    setDisabling(true);
    const result = await disableTotp();
    setDisabling(false);

    if (result?.success) {
      setShowDisableConfirm(false);
      setStatus({ enabled: false, verified: false });
    }
  };

  return (
    <Screen>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="text-sm text-mta-primary hover:underline mb-4"
          >
            ← Back to Settings
          </button>
          <h1 className="text-2xl font-bold text-text-primary dark:text-dark-text-primary mb-2">
            Two-Factor Authentication
          </h1>
          <p className="text-text-secondary dark:text-dark-text-secondary">
            Add an extra layer of security to your account
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div
            role="alert"
            className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
          >
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Status Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div
                className={[
                  "w-12 h-12 rounded-full flex items-center justify-center",
                  status?.enabled
                    ? "bg-green-100 dark:bg-green-900/30"
                    : "bg-gray-100 dark:bg-gray-700",
                ].join(" ")}
              >
                {status?.enabled ? (
                  <svg
                    className="w-6 h-6 text-green-600 dark:text-green-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-6 h-6 text-gray-400 dark:text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                )}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary dark:text-dark-text-primary">
                  {status?.enabled ? "MFA is Enabled" : "MFA is Disabled"}
                </h2>
                <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-1">
                  {status?.enabled
                    ? "Your account is protected with two-factor authentication."
                    : "Your account is not protected with two-factor authentication."}
                </p>
              </div>
            </div>

            {/* Status Toggle */}
            {status?.enabled ? (
              <button
                type="button"
                onClick={() => setShowDisableConfirm(true)}
                disabled={isLoading || disabling}
                className={[
                  "px-4 py-2 text-sm font-medium rounded-lg border transition-colors",
                  "text-red-600 dark:text-red-400 border-red-200 dark:border-red-800",
                  "hover:bg-red-50 dark:hover:bg-red-900/20",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                ].join(" ")}
              >
                {disabling ? "Disabling..." : "Disable"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/mfa/setup")}
                disabled={isLoading}
                className={[
                  "px-4 py-2 text-sm font-medium rounded-lg bg-mta-primary text-white",
                  "hover:bg-mta-primary/90 transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                ].join(" ")}
              >
                Enable
              </button>
            )}
          </div>
        </div>

        {/* Info Section */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-text-primary dark:text-dark-text-primary mb-3">
              What is two-factor authentication?
            </h3>
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
              Two-factor authentication (2FA) adds an extra layer of security to your account. In
              addition to your password, you'll need to enter a code from your authenticator app
              when signing in.
            </p>
            <ul className="text-sm text-text-secondary dark:text-dark-text-secondary space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-mta-primary mt-0.5">•</span>
                <span>
                  <strong>Recommended:</strong> Use Google Authenticator, Authy, or Microsoft
                  Authenticator
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-mta-primary mt-0.5">•</span>
                <span>
                  <strong>Backup codes:</strong> Save your backup codes in a secure location to
                  recover your account if you lose your device
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-mta-primary mt-0.5">•</span>
                <span>
                  <strong>Time-based:</strong> Codes change every 30 seconds for added security
                </span>
              </li>
            </ul>
          </div>

          {status?.enabled && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-green-800 dark:text-green-200 mb-2">
                Your account is secure
              </h3>
              <p className="text-sm text-green-700 dark:text-green-300">
                Two-factor authentication is enabled. You'll be asked for a verification code when
                you sign in from a new device or browser.
              </p>
            </div>
          )}

          {!status?.enabled && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                Protect your account
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Enable two-factor authentication to add an extra layer of security to your account.
                It only takes a few minutes to set up.
              </p>
            </div>
          )}
        </div>

        {/* Disable Confirmation Modal */}
        {showDisableConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="disable-mfa-title"
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
              <h3
                id="disable-mfa-title"
                className="text-lg font-semibold text-text-primary dark:text-dark-text-primary mb-2"
              >
                Disable Two-Factor Authentication?
              </h3>
              <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
                Your account will no longer be protected by two-factor authentication. This will
                make your account less secure.
              </p>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-4">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  <strong>Warning:</strong> If you disable 2FA and someone gets your password,
                  they'll have full access to your account.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDisableConfirm(false)}
                  disabled={disabling}
                  className={[
                    "flex-1 px-4 py-2 text-sm font-medium rounded-lg border",
                    "border-gray-300 dark:border-gray-600",
                    "text-text-primary dark:text-dark-text-primary",
                    "hover:bg-gray-50 dark:hover:bg-gray-700",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  ].join(" ")}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDisableMfa}
                  disabled={disabling}
                  className={[
                    "flex-1 px-4 py-2 text-sm font-medium rounded-lg",
                    "bg-red-600 dark:bg-red-700 text-white",
                    "hover:bg-red-700 dark:hover:bg-red-800",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  ].join(" ")}
                >
                  {disabling ? "Disabling..." : "Disable 2FA"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Screen>
  );
}
