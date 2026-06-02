import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Keep each test isolated: unmount React trees and clear persisted state.
afterEach(() => {
  cleanup();
  localStorage.clear();
});
