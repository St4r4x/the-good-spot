import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchIsochrone } from "./api";

describe("fetchIsochrone", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the /api/zone endpoint (backend route is /zone, not /isochrone)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchIsochrone("1 rue Test", 30, "transit");

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/api/zone");
    expect(calledUrl).not.toContain("/api/isochrone");
  });
});
