import { describe, expect, it } from "vitest";
import { isHeroSphere, isHeroNotificationWindow } from "./heroNotifications";

describe("hero notification timing", () => {
  it("excludes the network and both morphs", () => {
    for (const time of [0, 2.9, 3, 5.99, 10, 11, 12.99]) {
      expect(isHeroSphere(time)).toBe(false);
      expect(isHeroNotificationWindow(time)).toBe(false);
    }
  });
  it("reserves fade margins within the settled sphere", () => {
    expect(isHeroSphere(6)).toBe(true);
    expect(isHeroNotificationWindow(6)).toBe(false);
    expect(isHeroNotificationWindow(6.31)).toBe(true);
    expect(isHeroNotificationWindow(9.69)).toBe(true);
    expect(isHeroNotificationWindow(9.71)).toBe(false);
    expect(isHeroSphere(9.99)).toBe(true);
  });
  it("repeats the same eligibility each cycle without accumulating a backlog", () => {
    for (let cycle = 0; cycle < 20; cycle++) {
      expect(isHeroNotificationWindow(cycle * 13 + 7)).toBe(true);
      expect(isHeroNotificationWindow(cycle * 13 + 11)).toBe(false);
    }
  });
});
