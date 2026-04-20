/**
 * Event bus tests (C3.2).
 */

import { describe, expect, it, vi } from "vitest";
import { createEventBus, EVENTS } from "./events.js";
import { createTreeState, unlock } from "./tree-state.js";

describe("event bus basics", () => {
  it("subscribe / emit fires the callback with the payload", () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.subscribe("x", cb);
    bus.emit("x", { foo: 1 });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ foo: 1 });
  });

  it("unsubscribe cleans up", () => {
    const bus = createEventBus();
    const cb = vi.fn();
    const off = bus.subscribe("x", cb);
    off();
    bus.emit("x", {});
    expect(cb).not.toHaveBeenCalled();
    expect(bus.listenerCount("x")).toBe(0);
  });

  it("multiple subscribers all receive the payload", () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe("x", a);
    bus.subscribe("x", b);
    bus.emit("x", 42);
    expect(a).toHaveBeenCalledWith(42);
    expect(b).toHaveBeenCalledWith(42);
  });

  it("emit to an event with no listeners is a no-op", () => {
    const bus = createEventBus();
    expect(() => bus.emit("nothing", {})).not.toThrow();
  });

  it("subscribe requires a function", () => {
    const bus = createEventBus();
    expect(() => bus.subscribe("x", null)).toThrow();
  });

  it("unsubscribing during emit is safe (no double-fire, no skip)", () => {
    const bus = createEventBus();
    const log = [];
    let offB;
    const a = () => { log.push("a"); offB(); };
    const b = () => { log.push("b"); };
    bus.subscribe("x", a);
    offB = bus.subscribe("x", b);
    bus.emit("x");
    // Both fire on first emit (b had already been snapshotted).
    expect(log).toEqual(["a", "b"]);
    // Second emit: b is gone.
    log.length = 0;
    bus.emit("x");
    expect(log).toEqual(["a"]);
  });
});

describe("tree-state integration", () => {
  it("emits node-unlocked on unlock", () => {
    const bus = createEventBus();
    const state = createTreeState();
    const spy = vi.fn();
    bus.subscribe(EVENTS.NODE_UNLOCKED, spy);
    unlock(state, "r1", bus);
    expect(spy).toHaveBeenCalledWith({ nodeId: "r1" });
  });

  it("emits node-available for newly available children", () => {
    const bus = createEventBus();
    const state = createTreeState();
    const fired = [];
    bus.subscribe(EVENTS.NODE_AVAILABLE, (p) => fired.push(p.nodeId));
    unlock(state, "r1", bus);
    // After r1, r2/r3/r4/f1 flip from locked → available.
    expect(fired.sort()).toEqual(["f1", "r2", "r3", "r4"]);
  });

  it("emits branch-completed only when every node in the branch is unlocked", () => {
    const bus = createEventBus();
    const state = createTreeState();
    const spy = vi.fn();
    bus.subscribe(EVENTS.BRANCH_COMPLETED, spy);

    // Unlock only some of root — no branch-completed.
    unlock(state, "r1", bus);
    unlock(state, "r2", bus);
    unlock(state, "r3", bus);
    expect(spy).not.toHaveBeenCalled();

    // Complete root.
    unlock(state, "r4", bus);
    expect(spy).toHaveBeenCalledWith({ branchId: "root" });
  });

  it("emits climax-met when a climax node unlocks", () => {
    const bus = createEventBus();
    const state = createTreeState();
    const spy = vi.fn();
    bus.subscribe(EVENTS.CLIMAX_MET, spy);

    const chain = [
      "r1", "r2",
      "a1", "a2", "a3", "a4",
      "c1", "c2", "c3",
      "e1", "e2", "e3", "e4",
      "cx-biodynamic",
    ];
    for (const id of chain) unlock(state, id, bus);
    expect(spy).toHaveBeenCalledWith({ nodeId: "cx-biodynamic" });
  });

  it("clear() removes every subscription", () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.subscribe("a", cb);
    bus.subscribe("b", cb);
    bus.clear();
    bus.emit("a");
    bus.emit("b");
    expect(cb).not.toHaveBeenCalled();
  });
});
