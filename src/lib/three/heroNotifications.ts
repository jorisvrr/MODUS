import { CYCLE, CYCLE_TOTAL } from "./pointCloud";

function phase(time: number) {
  return ((time % CYCLE_TOTAL) + CYCLE_TOTAL) % CYCLE_TOTAL;
}

/** Only the fully settled sphere, never either morph or the scattered hold. */
export function isHeroSphere(time: number): boolean {
  const start = CYCLE.disorderHold + CYCLE.morphToOrder;
  return phase(time) >= start && phase(time) < start + CYCLE.orderHold;
}

/** Leave space for the entrance and exit fades inside the sphere hold. */
export function isHeroNotificationWindow(time: number): boolean {
  const start = CYCLE.disorderHold + CYCLE.morphToOrder;
  const margin = 0.3;
  return (
    phase(time) >= start + margin &&
    phase(time) < start + CYCLE.orderHold - margin
  );
}
