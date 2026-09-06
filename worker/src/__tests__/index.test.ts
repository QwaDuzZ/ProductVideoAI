import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Worker build artifacts", () => {
  it("index.ts exists and has expected functions", () => {
    const code = readFileSync(join(__dirname, "../index.ts"), "utf-8");
    expect(code).toContain("processAudioMix");
    expect(code).toContain("processExtractAudio");
    expect(code).toContain("processMergeAudio");
    expect(code).toContain("processOutro");
    expect(code).toContain("processStitch");
    expect(code).toContain("processStabilizeChunk");
    expect(code).toContain("validateMediaFile");
  });

  it("Dockerfile installs ffmpeg", () => {
    const dockerfile = readFileSync(join(__dirname, "../../Dockerfile"), "utf-8");
    expect(dockerfile).toContain("ffmpeg");
    expect(dockerfile).toContain("node:20-alpine");
  });
});
