import { describe, expect, it } from "vitest";
import {
  signupSchema,
  loginSchema,
  postSchema,
  livestockSchema,
  produceSchema,
  equipmentSchema,
  confirmationSchema,
} from "./validation";

const baseSignup = {
  name: "Tendai",
  email: "tendai@example.com",
  password: "password123",
  region: "Mashonaland East",
  locality: "Marondera",
  capabilities: ["FARMER"] as string[],
};
const validSignup = { ...baseSignup, farmName: "Tendai's Farm" };

describe("signupSchema", () => {
  it("accepts a minimal valid farmer signup", () => {
    expect(signupSchema.safeParse(validSignup).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = signupSchema.safeParse({ ...validSignup, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a password under 8 characters", () => {
    const result = signupSchema.safeParse({ ...validSignup, password: "short" });
    expect(result.success).toBe(false);
  });

  it("requires at least one role", () => {
    const result = signupSchema.safeParse({ ...validSignup, capabilities: [] });
    expect(result.success).toBe(false);
  });

  it("requires farmName when the FARMER capability is selected", () => {
    const result = signupSchema.safeParse({ ...baseSignup, capabilities: ["FARMER"] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["farmName"]);
    }
  });

  it("does not require farmName when FARMER isn't selected", () => {
    const result = signupSchema.safeParse({ ...baseSignup, capabilities: ["BUYER"] });
    expect(result.success).toBe(true);
  });

  it("requires vehicleType when the TRANSPORTER capability is selected", () => {
    const result = signupSchema.safeParse({
      ...validSignup,
      capabilities: ["TRANSPORTER"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["vehicleType"]);
    }
  });

  it("accepts TRANSPORTER when vehicleType is present", () => {
    const result = signupSchema.safeParse({
      ...validSignup,
      capabilities: ["TRANSPORTER"],
      vehicleType: "TRUCK",
    });
    expect(result.success).toBe(true);
  });
});

describe("loginSchema", () => {
  it("accepts a valid email and non-empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("postSchema", () => {
  const base = {
    objective: "SELL",
    category: "PRODUCE",
    title: "10 tonnes of maize",
    region: "Mashonaland East",
    locality: "Marondera",
  };

  it("accepts a minimal valid post", () => {
    expect(postSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an unknown category", () => {
    expect(postSchema.safeParse({ ...base, category: "NOT_A_CATEGORY" }).success).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(postSchema.safeParse({ ...base, title: "" }).success).toBe(false);
  });

  it("coerces quantity/askingPrice from form-data strings", () => {
    const result = postSchema.safeParse({ ...base, quantity: "12.5", askingPrice: "300" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quantity).toBe(12.5);
      expect(result.data.askingPrice).toBe(300);
    }
  });

  it("rejects a negative or zero quantity", () => {
    expect(postSchema.safeParse({ ...base, quantity: "0" }).success).toBe(false);
    expect(postSchema.safeParse({ ...base, quantity: "-5" }).success).toBe(false);
  });
});

describe("livestockSchema", () => {
  it("accepts a valid record", () => {
    const result = livestockSchema.safeParse({ species: "CATTLE", sex: "MALE", quantity: "5" });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown species", () => {
    expect(
      livestockSchema.safeParse({ species: "DRAGON", sex: "MALE", quantity: "5" }).success,
    ).toBe(false);
  });

  it("rejects a non-integer quantity", () => {
    expect(
      livestockSchema.safeParse({ species: "CATTLE", sex: "MALE", quantity: "2.5" }).success,
    ).toBe(false);
  });
});

describe("produceSchema", () => {
  it("accepts a valid record", () => {
    const result = produceSchema.safeParse({ cropType: "Maize", quantity: "10", unit: "TONNE" });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown unit", () => {
    expect(
      produceSchema.safeParse({ cropType: "Maize", quantity: "10", unit: "GALLON" }).success,
    ).toBe(false);
  });
});

describe("equipmentSchema", () => {
  it("accepts a valid record", () => {
    expect(equipmentSchema.safeParse({ name: "Tractor 1", category: "TRACTOR" }).success).toBe(
      true,
    );
  });

  it("rejects an unknown category", () => {
    expect(
      equipmentSchema.safeParse({ name: "Tractor 1", category: "SPACESHIP" }).success,
    ).toBe(false);
  });
});

describe("confirmationSchema", () => {
  it("accepts a valid outcome without a score", () => {
    expect(
      confirmationSchema.safeParse({ matchId: "m1", outcome: "COMPLETED_GOOD" }).success,
    ).toBe(true);
  });

  it("rejects a score outside 1-5", () => {
    expect(
      confirmationSchema.safeParse({ matchId: "m1", outcome: "COMPLETED_GOOD", score: "6" })
        .success,
    ).toBe(false);
  });

  it("rejects an unknown outcome", () => {
    expect(
      confirmationSchema.safeParse({ matchId: "m1", outcome: "SOMETHING_ELSE" }).success,
    ).toBe(false);
  });
});
