import { describe, expect, it } from "vitest";
import { transportCoversRoute } from "./transport-suggestions-core";

const HARARE = { province: "Harare" };
const MANICALAND = { province: "Manicaland" };

describe("transportCoversRoute", () => {
  it("covers a route when the transporter is based at the origin with no stated destination", () => {
    const result = transportCoversRoute(
      { province: "Harare", destinationProvince: null },
      HARARE,
      MANICALAND,
    );
    expect(result).toBe(true);
  });

  it("covers a route when the transporter's stated destination matches where the goods need to go", () => {
    const result = transportCoversRoute(
      { province: "Harare", destinationProvince: "Manicaland" },
      HARARE,
      MANICALAND,
    );
    expect(result).toBe(true);
  });

  it("does not cover a route when the transporter isn't based at the origin", () => {
    const result = transportCoversRoute(
      { province: "Manicaland", destinationProvince: "Harare" },
      HARARE,
      MANICALAND,
    );
    expect(result).toBe(false);
  });

  it("does not cover a route when the transporter's stated destination goes somewhere else", () => {
    const result = transportCoversRoute(
      { province: "Harare", destinationProvince: "Matabeleland North" },
      HARARE,
      MANICALAND,
    );
    expect(result).toBe(false);
  });

  it("covers a same-province (local) trade for a transporter based there", () => {
    const result = transportCoversRoute({ province: "Harare", destinationProvince: null }, HARARE, HARARE);
    expect(result).toBe(true);
  });
});
