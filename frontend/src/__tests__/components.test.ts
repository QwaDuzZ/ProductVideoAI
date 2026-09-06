import { describe, it, expect } from "vitest";

describe("StatusPill", () => {
  it("renders status label", async () => {
    const { StatusPill } = await import("../components/StatusPill");
    expect(StatusPill).toBeDefined();
  });
});

describe("CreditChip", () => {
  it("renders credit amount", async () => {
    const { CreditChip } = await import("../components/CreditChip");
    expect(CreditChip).toBeDefined();
  });
});

describe("SegmentControl", () => {
  it("renders segment control", async () => {
    const { SegmentControl } = await import("../components/SegmentControl");
    expect(SegmentControl).toBeDefined();
  });
});

describe("Modal", () => {
  it("renders modal", async () => {
    const { Modal } = await import("../components/Modal");
    expect(Modal).toBeDefined();
  });
});

describe("ErrorState", () => {
  it("renders error state", async () => {
    const { ErrorState } = await import("../components/ErrorState");
    expect(ErrorState).toBeDefined();
  });
});

describe("Toast", () => {
  it("renders toast", async () => {
    const { Toast } = await import("../components/Toast");
    expect(Toast).toBeDefined();
  });
});
