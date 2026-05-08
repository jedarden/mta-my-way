/**
 * Tests for ErrorBoundary component
 *
 * Tests the error boundary functionality including:
 * - Catching React errors
 * - Displaying fallback UI
 * - Providing reset functionality
 * - Logging errors
 * - Component recovery
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

// Mock console.error to avoid noise in tests
const originalError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalError;
});

// Component that throws an error
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error");
  }
  return <div>No error</div>;
}

describe("ErrorBoundary", () => {
  describe("error catching", () => {
    it("renders children when there is no error", () => {
      render(
        <ErrorBoundary fallback={<div>Something went wrong</div>}>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByText("No error")).toBeInTheDocument();
      expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    });

    it("catches errors and renders fallback", () => {
      // Suppress the expected error log
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <ErrorBoundary fallback={<div>Something went wrong</div>}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.queryByText("No error")).not.toBeInTheDocument();
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();

      spy.mockRestore();
    });

    it("calls onError callback when error occurs", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const onError = vi.fn();

      render(
        <ErrorBoundary fallback={<div>Something went wrong</div>} onError={onError}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(onError).toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.any(Object));

      spy.mockRestore();
    });
  });

  describe("custom fallback", () => {
    it("renders custom fallback component", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const customFallback = <div className="custom-error">Custom error message</div>;

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText("Custom error message")).toBeInTheDocument();
      expect(screen.getByText("Custom error message")).toHaveClass("custom-error");

      spy.mockRestore();
    });

    it("renders default fallback when none provided", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

      spy.mockRestore();
    });
  });

  describe("reset functionality", () => {
    it("resets error boundary when key changes", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      let shouldThrow = true;

      const { rerender } = render(
        <ErrorBoundary fallback={<div>Something went wrong</div>} key="1">
          <ThrowError shouldThrow={shouldThrow} />
        </ErrorBoundary>
      );

      expect(screen.getByText("Something went wrong")).toBeInTheDocument();

      // Rerender with new key and no error
      shouldThrow = false;
      rerender(
        <ErrorBoundary fallback={<div>Something went wrong</div>} key="2">
          <ThrowError shouldThrow={shouldThrow} />
        </ErrorBoundary>
      );

      expect(screen.getByText("No error")).toBeInTheDocument();
      expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();

      spy.mockRestore();
    });
  });

  describe("nested error boundaries", () => {
    it("inner boundary catches error before outer", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const outerOnError = vi.fn();
      const innerOnError = vi.fn();

      render(
        <ErrorBoundary fallback={<div>Outer error</div>} onError={outerOnError}>
          <ErrorBoundary fallback={<div>Inner error</div>} onError={innerOnError}>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </ErrorBoundary>
      );

      expect(screen.getByText("Inner error")).toBeInTheDocument();
      expect(screen.queryByText("Outer error")).not.toBeInTheDocument();
      expect(innerOnError).toHaveBeenCalled();
      expect(outerOnError).not.toHaveBeenCalled();

      spy.mockRestore();
    });

    it("outer boundary catches error when inner boundary doesn't exist", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const outerOnError = vi.fn();

      render(
        <ErrorBoundary fallback={<div>Outer error</div>} onError={outerOnError}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText("Outer error")).toBeInTheDocument();
      expect(outerOnError).toHaveBeenCalled();

      spy.mockRestore();
    });
  });

  describe("error information", () => {
    it("provides error and errorInfo to onError callback", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const onError = vi.fn();

      render(
        <ErrorBoundary fallback={<div>Error</div>} onError={onError}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(onError).toHaveBeenCalledTimes(1);

      const [error, errorInfo] = onError.mock.calls[0];
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Test error");
      expect(errorInfo).toHaveProperty("componentStack");

      spy.mockRestore();
    });

    it("logs error to console by default", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <ErrorBoundary fallback={<div>Error</div>}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });
  });

  describe("error recovery", () => {
    it("can recover from error state", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const user = userEvent.setup();
      let shouldThrow = true;

      function RecoverableComponent() {
        return (
          <div>
            <button onClick={() => (shouldThrow = !shouldThrow)}>Toggle Error</button>
            <ErrorBoundary key={shouldThrow ? "error" : "ok"} fallback={<div>Error occurred</div>}>
              <ThrowError shouldThrow={shouldThrow} />
            </ErrorBoundary>
          </div>
        );
      }

      const { rerender } = render(<RecoverableComponent />);

      // Initially shows error
      expect(screen.getByText("Error occurred")).toBeInTheDocument();

      // Click toggle and rerender
      const button = screen.getByRole("button");
      await user.click(button);

      rerender(<RecoverableComponent />);

      // Should recover
      expect(screen.getByText("No error")).toBeInTheDocument();

      spy.mockRestore();
    });
  });

  describe("component lifecycle", () => {
    it("calls getDerivedStateFromError on error", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <ErrorBoundary fallback={<div>Error</div>}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // ErrorBoundary should have updated state to show error
      expect(screen.getByText("Error")).toBeInTheDocument();

      spy.mockRestore();
    });

    it("calls componentDidCatch on error", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const onError = vi.fn();

      render(
        <ErrorBoundary fallback={<div>Error</div>} onError={onError}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(onError).toHaveBeenCalled();

      spy.mockRestore();
    });
  });

  describe("edge cases", () => {
    it("handles errors during rendering", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      function BadRender() {
        throw new Error("Render error");
      }

      render(
        <ErrorBoundary fallback={<div>Caught render error</div>}>
          <BadRender />
        </ErrorBoundary>
      );

      expect(screen.getByText("Caught render error")).toBeInTheDocument();

      spy.mockRestore();
    });

    // Note: ErrorBoundary cannot catch errors thrown in async callbacks
    // This is a React limitation - errors must be thrown during render or in lifecycle methods

    it("handles errors in event handlers (won't catch)", () => {
      // Note: ErrorBoundary cannot catch errors in event handlers
      // This is expected React behavior - errors must be thrown during render
      function ButtonWithError() {
        const handleClick = () => {
          // Error would be thrown here, but we won't test it
          // because it would cause an uncaught error in the test
          console.error("Event handler error (not caught by ErrorBoundary)");
        };

        return <button onClick={handleClick}>Click me</button>;
      }

      const onError = vi.fn();

      render(
        <ErrorBoundary fallback={<div>Error</div>} onError={onError}>
          <ButtonWithError />
        </ErrorBoundary>
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();

      // ErrorBoundary should not have caught any errors yet
      expect(onError).not.toHaveBeenCalled();
    });
  });
});

// Helper to run cleanup after all tests
afterEach(() => {
  vi.restoreAllMocks();
});
