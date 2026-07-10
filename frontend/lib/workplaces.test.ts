import { describe, expect, it } from "vitest";
import { parseSavedWorkplaces, serializeWorkplaces } from "./workplaces";

describe("parseSavedWorkplaces", () => {
  it("returns defaults for null", () => {
    expect(parseSavedWorkplaces(null)).toEqual({
      address1: "",
      address2: "",
      minutes: "30",
      modes: ["transit"],
    });
  });

  it("returns defaults for corrupt JSON", () => {
    expect(parseSavedWorkplaces("{not json")).toEqual(parseSavedWorkplaces(null));
  });

  it("falls back to default modes when modes is empty or missing", () => {
    expect(parseSavedWorkplaces('{"modes":[]}').modes).toEqual(["transit"]);
    expect(parseSavedWorkplaces('{"address1":"a"}').modes).toEqual(["transit"]);
  });

  it("round-trips through serializeWorkplaces", () => {
    const w = {
      address1: "1 rue A",
      address2: "2 rue B",
      minutes: "45",
      modes: ["walk", "bicycle"] as ["walk", "bicycle"],
    };
    expect(parseSavedWorkplaces(serializeWorkplaces(w))).toEqual(w);
  });
});
