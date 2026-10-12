/**
 * Tests for ImageErrorFallback component
 *
 * Covers fallback modes (icon/text/custom), map/thumbnail variants,
 * retry behavior with its 2s reset window, and the SafeImage wrapper.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageErrorFallback, SafeImage } from "./ImageErrorFallback";

const onRetry = vi.fn();

beforeEach(() => {
  onRetry.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ImageErrorFallback", () => {
  describe("icon mode (default)", () => {
    it("exposes the default unavailable text as an img role", () => {
      render(<ImageErrorFallback alt="Station photo" />);

      expect(screen.getByRole("img")).toHaveAttribute(
        "aria-label",
        "Image unavailable: Station photo"
      );
    });

    it("falls back to a bare unavailable label with empty alt", () => {
      render(<ImageErrorFallback alt="" />);

      expect(screen.getByRole("img")).toHaveAttribute("aria-label", "Image unavailable");
    });

    it("shows the map-specific text and icon for maps", () => {
      const { container } = render(<ImageErrorFallback alt="Map" isMap={true} />);

      expect(screen.getByRole("img")).toHaveAttribute("aria-label", "Map unavailable");
      // Map icon is the fold-out map polygon, not the photo rect
      expect(container.querySelector("polygon")).toBeInTheDocument();
      expect(container.querySelector("rect")).not.toBeInTheDocument();
    });

    it("honors custom icon and text overrides", () => {
      render(<ImageErrorFallback alt="A" icon={<span data-testid="custom-icon" />} text="Custom text" />);

      expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
      expect(screen.getByText("Custom text")).toBeInTheDocument();
      expect(screen.queryByText("Image unavailable: A")).not.toBeInTheDocument();
    });

    it("keeps layout dimensions for numeric sizes", () => {
      render(<ImageErrorFallback alt="A" width={120} height={80} />);

      const box = screen.getByRole("img");
      expect(box).toHaveStyle({ width: "120px", height: "80px", minHeight: "200px" });
    });

    it("passes string sizes through and defaults minHeight", () => {
      render(<ImageErrorFallback alt="A" width="50%" height="auto" />);

      expect(screen.getByRole("img")).toHaveStyle({ width: "50%", height: "auto" });
    });

    it("applies the base surface styling plus custom class", () => {
      render(<ImageErrorFallback alt="A" className="extra-class" />);

      expect(screen.getByRole("img")).toHaveClass(
        "bg-surface",
        "dark:bg-dark-surface",
        "rounded-lg",
        "extra-class"
      );
    });
  });

  describe("thumbnail variant", () => {
    it("uses the fixed thumbnail sizing and hides text", () => {
      render(<ImageErrorFallback alt="Thumb" isThumbnail={true} canRetry={true} onRetry={onRetry} />);

      const box = screen.getByRole("img");
      expect(box).toHaveClass("w-16", "h-16");
      expect(box).toHaveStyle({ minHeight: "64px" });
      expect(screen.queryByText("Image unavailable: Thumb")).not.toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("retry (icon mode)", () => {
    it("shows no retry button by default or without both props", () => {
      const { unmount } = render(<ImageErrorFallback alt="A" />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      unmount();

      render(<ImageErrorFallback alt="A" canRetry={true} />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("calls onRetry and guards re-entry until the reset window elapses", () => {
      render(<ImageErrorFallback alt="A" canRetry={true} onRetry={onRetry} />);

      const button = screen.getByRole("button", { name: "Retry loading A" });
      expect(button).toHaveTextContent("Retry");
      fireEvent.click(button);
      expect(onRetry).toHaveBeenCalledTimes(1);

      // While isRetrying is true the button is disabled and shows Retrying...
      expect(screen.getByRole("button", { name: "Retry loading A" })).toBeDisabled();
      expect(screen.getByText("Retrying...")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Retry loading A" }));
      expect(onRetry).toHaveBeenCalledTimes(1);

      // After the 2s reset the button re-enables
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      const reset = screen.getByRole("button", { name: "Retry loading A" });
      expect(reset).toBeEnabled();
      fireEvent.click(reset);
      expect(onRetry).toHaveBeenCalledTimes(2);
    });
  });

  describe("text mode", () => {
    it("renders only the text", () => {
      const { container } = render(<ImageErrorFallback alt="A" mode="text" text="Text fallback" />);

      expect(screen.getByText("Text fallback")).toBeInTheDocument();
      expect(container.querySelector("svg")).not.toBeInTheDocument();
    });

    it("supports retry in text mode", () => {
      render(<ImageErrorFallback alt="A" mode="text" canRetry={true} onRetry={onRetry} />);

      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("hides retry for thumbnails in text mode", () => {
      render(
        <ImageErrorFallback alt="A" mode="text" isThumbnail={true} canRetry={true} onRetry={onRetry} />
      );

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("custom mode", () => {
    it("renders the custom fallback instead of icon or text", () => {
      render(
        <ImageErrorFallback
          alt="A"
          mode="custom"
          customFallback={<div data-testid="custom-fallback">Custom node</div>}
        />
      );

      expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();
      expect(screen.queryByText(/Image unavailable/)).not.toBeInTheDocument();
    });
  });
});

describe("SafeImage", () => {
  it("renders an img while loading succeeds", () => {
    render(<SafeImage src="/img.png" alt="Pic" className="pic-class" />);

    const img = screen.getByAltText("Pic");
    expect(img).toHaveAttribute("src", "/img.png");
    expect(img).toHaveClass("pic-class");
  });

  it("swaps to the fallback when the image errors", () => {
    render(<SafeImage src="/broken.png" alt="Broken" />);

    fireEvent.error(screen.getByAltText("Broken"));

    expect(screen.queryByAltText("Broken")).not.toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "Image unavailable: Broken");
  });

  it("retrying the fallback restores the image", () => {
    render(<SafeImage src="/broken.png" alt="Broken" />);

    fireEvent.error(screen.getByAltText("Broken"));
    fireEvent.click(screen.getByRole("button", { name: "Retry loading Broken" }));

    expect(screen.getByAltText("Broken")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("passes fallback configuration through", () => {
    render(
      <SafeImage
        src="/map.png"
        alt="Map view"
        isMap={true}
        fallbackMode="text"
        canRetry={false}
        className="map-class"
      />
    );

    fireEvent.error(screen.getByAltText("Map view"));

    expect(screen.getByText("Map unavailable")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveClass("map-class");
  });
});
