/**
 * MfaSetupScreen - Multi-factor authentication setup screen.
 *
 * Guides users through setting up TOTP-based MFA with QR code scanning.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Screen from "../components/layout/Screen";
import { useMFA } from "../hooks/useMFA";

type SetupStep = "start" | "scan" | "verify" | "complete";

export default function MfaSetupScreen() {
  const { isLoading, error, setupTotp, enableTotp } = useMFA();
  const navigate = useNavigate();
  const [step, setStep] = useState<SetupStep>("start");
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationCode, setVerificationCode] = useState<string>("");
  const [savedCodes, setSavedCodes] = useState<boolean>(false);

  const handleStartSetup = async (): Promise<void> => {
    const result = await setupTotp();
    if (result) {
      setQrCodeUrl(result.qrCodeUrl);
      setSecret(result.secret);
      setBackupCodes(result.backupCodes);
      setStep("scan");
    }
  };

  const handleVerifyCode = async (): Promise<void> => {
    if (!verificationCode || verificationCode.length !== 6) {
      return;
    }

    const result = await enableTotp(verificationCode);
    if (result?.success) {
      setStep("complete");
    }
  };

  const handleConfirmBackupCodes = (): void => {
    if (savedCodes) {
      setStep("verify");
    }
  };

  const handleFinish = (): void => {
    navigate("/settings");
  };

  return (
    <Screen>
      <div className="max-w-md mx-auto px-4 py-8">
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
            {step === "complete" ? "MFA Enabled!" : "Set Up Multi-Factor Authentication"}
          </h1>
          <p className="text-text-secondary dark:text-dark-text-secondary">
            {step === "complete"
              ? "Your account is now more secure."
              : "Add an extra layer of security to your account."}
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

        {/* Step: Start */}
        {step === "start" && (
          <div className="space-y-6">
            <div className="p-4 bg-background-secondary dark:bg-dark-background-secondary rounded-lg">
              <h2 className="text-sm font-medium text-text-primary dark:text-dark-text-primary mb-3">
                What is MFA?
              </h2>
              <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-3">
                Multi-factor authentication (MFA) adds an extra layer of security by requiring a
                verification code from your authenticator app when you sign in.
              </p>
              <ul className="text-sm text-text-secondary dark:text-dark-text-secondary space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-mta-primary mt-0.5">✓</span>
                  <span>Protects your account even if your password is compromised</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-mta-primary mt-0.5">✓</span>
                  <span>Works with Google Authenticator, Authy, and other TOTP apps</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-mta-primary mt-0.5">✓</span>
                  <span>Includes backup codes for account recovery</span>
                </li>
              </ul>
            </div>

            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                Before you continue
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Make sure you have an authenticator app installed on your phone, such as Google
                Authenticator, Authy, or Microsoft Authenticator.
              </p>
            </div>

            <button
              type="button"
              onClick={handleStartSetup}
              disabled={isLoading}
              className={[
                "w-full px-4 py-3 bg-mta-primary hover:bg-mta-primary/90 text-white rounded-lg font-medium",
                "transition-colors focus:outline-none focus:ring-2 focus:ring-mta-primary focus:ring-offset-2",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              {isLoading ? "Loading..." : "Continue"}
            </button>
          </div>
        )}

        {/* Step: Scan QR Code */}
        {step === "scan" && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mb-4 p-4 bg-white rounded-lg inline-block">
                {/* QR Code Placeholder - in production, use a QR code library */}
                <div className="w-48 h-48 flex items-center justify-center bg-gray-100">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeUrl)}`}
                    alt="QR Code for TOTP setup"
                    className="w-full h-full"
                  />
                </div>
              </div>
              <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
                Scan this QR code with your authenticator app
              </p>

              <details className="text-left">
                <summary className="text-sm text-mta-primary cursor-pointer hover:underline">
                  Can't scan? Enter code manually
                </summary>
                <div className="mt-3 p-3 bg-background-secondary dark:bg-dark-background-secondary rounded-lg">
                  <p className="text-xs text-text-secondary dark:text-dark-text-secondary mb-2">
                    Enter this code in your authenticator app:
                  </p>
                  <code className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded block break-all">
                    {secret}
                  </code>
                </div>
              </details>
            </div>

            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                Save your backup codes
              </h3>
              <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                These codes can be used to access your account if you lose your authenticator
                device. Save them somewhere safe.
              </p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {backupCodes.map((code, index) => (
                  <code
                    key={index}
                    className="text-xs font-mono bg-white dark:bg-gray-800 px-2 py-1 rounded text-center"
                  >
                    {code}
                  </code>
                ))}
              </div>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={savedCodes}
                  onChange={(e) => setSavedCodes(e.target.checked)}
                  className="mt-1 w-4 h-4 text-mta-primary rounded focus:ring-mta-primary"
                />
                <span className="text-sm text-red-700 dark:text-red-300">
                  I have saved my backup codes in a secure location
                </span>
              </label>
            </div>

            <button
              type="button"
              onClick={handleConfirmBackupCodes}
              disabled={!savedCodes || isLoading}
              className={[
                "w-full px-4 py-3 bg-mta-primary hover:bg-mta-primary/90 text-white rounded-lg font-medium",
                "transition-colors focus:outline-none focus:ring-2 focus:ring-mta-primary focus:ring-offset-2",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              Continue
            </button>
          </div>
        )}

        {/* Step: Verify Code */}
        {step === "verify" && (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-text-secondary dark:text-dark-text-secondary mb-4">
                Enter the 6-digit code from your authenticator app to verify setup
              </p>
            </div>

            <div>
              <label
                htmlFor="verification-code"
                className="block text-sm font-medium text-text-primary dark:text-dark-text-primary mb-2"
              >
                Verification Code
              </label>
              <input
                id="verification-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className={[
                  "w-full px-4 py-3 text-center text-2xl tracking-widest",
                  "border border-gray-300 dark:border-gray-600 rounded-lg",
                  "bg-white dark:bg-gray-800",
                  "text-text-primary dark:text-dark-text-primary",
                  "focus:outline-none focus:ring-2 focus:ring-mta-primary focus:border-transparent",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                ].join(" ")}
                disabled={isLoading}
                autoFocus
              />
            </div>

            <button
              type="button"
              onClick={handleVerifyCode}
              disabled={verificationCode.length !== 6 || isLoading}
              className={[
                "w-full px-4 py-3 bg-mta-primary hover:bg-mta-primary/90 text-white rounded-lg font-medium",
                "transition-colors focus:outline-none focus:ring-2 focus:ring-mta-primary focus:ring-offset-2",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              {isLoading ? "Verifying..." : "Verify and Enable"}
            </button>

            <button
              type="button"
              onClick={() => setStep("scan")}
              className="w-full px-4 py-3 text-mta-primary hover:underline"
            >
              Back
            </button>
          </div>
        )}

        {/* Step: Complete */}
        {step === "complete" && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
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
              <h2 className="text-xl font-semibold text-text-primary dark:text-dark-text-primary mb-2">
                MFA is now enabled
              </h2>
              <p className="text-text-secondary dark:text-dark-text-secondary">
                You'll be asked for a verification code when you sign in.
              </p>
            </div>

            <button
              type="button"
              onClick={handleFinish}
              className={[
                "w-full px-4 py-3 bg-mta-primary hover:bg-mta-primary/90 text-white rounded-lg font-medium",
                "transition-colors focus:outline-none focus:ring-2 focus:ring-mta-primary focus:ring-offset-2",
              ].join(" ")}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </Screen>
  );
}
