import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { RegisterServiceWorker } from "./register-service-worker";

/**
 * The update path, which has one catastrophic failure mode and one silent one.
 *
 * Catastrophic: a reload loop. The worker calls `clients.claim()`, which fires
 * `controllerchange` on a first-ever visit as well as on a real update. Treat
 * the first one as an update and every device reloads immediately after every
 * first load, forever, and the app is unusable.
 *
 * Silent: never checking again. Registration succeeds, everything looks fine,
 * and installed apps quietly stay on the build they were installed with.
 */

const toastFn = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((...args: unknown[]) => toastFn(...args), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

const reload = vi.fn();
let listeners: Record<string, Array<() => void>> = {};
let update: ReturnType<typeof vi.fn>;

function installServiceWorkerMock({ hasController }: { hasController: boolean }) {
  listeners = {};
  update = vi.fn(async () => {});
  const register = vi.fn(async () => ({ update }));

  vi.stubGlobal("navigator", {
    serviceWorker: {
      controller: hasController ? {} : null,
      register,
      addEventListener: (type: string, fn: () => void) => {
        (listeners[type] ??= []).push(fn);
      },
      removeEventListener: () => {},
    },
  });
  return { register };
}

const fire = (type: string) => listeners[type]?.forEach((fn) => fn());

/**
 * Flush pending microtasks under fake timers.
 *
 * Testing Library's `waitFor` polls on real timers and deadlocks against
 * `vi.useFakeTimers()`, so the registration promise is drained explicitly
 * instead.
 */
const flush = () => vi.advanceTimersByTimeAsync(0);

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  toastFn.mockClear();
  reload.mockClear();
  setVisibility("visible");
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("registration", () => {
  it("registers the worker and asks for an update straight away", async () => {
    const { register } = installServiceWorkerMock({ hasController: false });
    render(<RegisterServiceWorker />);

    await flush();
    expect(register).toHaveBeenCalledWith("/sw.js");
    expect(update).toHaveBeenCalled();
  });

  it("keeps checking while the app stays open", async () => {
    installServiceWorkerMock({ hasController: true });
    render(<RegisterServiceWorker />);
    await flush();
    expect(update).toHaveBeenCalledTimes(1);

    // A backgrounded phone app can go weeks without a cold start. If this
    // stops firing, installed apps silently freeze on their install-day build.
    await vi.advanceTimersByTimeAsync(31 * 60 * 1000);
    expect(update.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("applying a new version", () => {
  it("does not reload after a first-ever install", async () => {
    // The reload-loop guard. clients.claim() fires controllerchange here too.
    installServiceWorkerMock({ hasController: false });
    render(<RegisterServiceWorker />);
    await flush();
    expect(update).toHaveBeenCalled();

    setVisibility("hidden");
    fire("controllerchange");

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads silently once a new version takes over and the app is hidden", async () => {
    installServiceWorkerMock({ hasController: true });
    render(<RegisterServiceWorker />);
    await flush();
    expect(update).toHaveBeenCalled();

    setVisibility("hidden");
    fire("controllerchange");

    await flush();
    expect(reload).toHaveBeenCalled();
    expect(toastFn).not.toHaveBeenCalled();
  });

  it("never reloads under a user who is looking at the screen", async () => {
    installServiceWorkerMock({ hasController: true });
    render(<RegisterServiceWorker />);
    await flush();
    expect(update).toHaveBeenCalled();

    fire("controllerchange");
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(reload).not.toHaveBeenCalled();
  });

  it("offers the reload to someone parked on one screen", async () => {
    installServiceWorkerMock({ hasController: true });
    render(<RegisterServiceWorker />);
    await flush();
    expect(update).toHaveBeenCalled();

    fire("controllerchange");
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(toastFn).toHaveBeenCalledTimes(1);
    const [message] = toastFn.mock.calls[0];
    expect(String(message)).toMatch(/new version/i);
  });
});
