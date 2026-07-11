/**
 * Tests for SessionEmitter.
 *
 * Verifies:
 *   - `start()` appends a `session_started` event with the requested
 *     `detected_by` and records the emitted event id as the current
 *     session.
 *   - `noteActivity()` inside the idle window is a pure pointer bump —
 *     no events emitted.
 *   - `noteActivity()` after an idle gap emits `session_ended` at the
 *     LAST activity time (not the current one — the previous session
 *     ended when the user went idle, not when they came back) and a
 *     fresh `session_started` at now with `detected_by = 'idle'`.
 *   - `endManual()` closes the current session and clears the pointer.
 *   - `noteActivity()` bootstraps a session if one is not already open.
 *   - `onEmit` fires after every append.
 *
 * The outbox is a hand-rolled fixture — the real LocalEventStore's
 * IndexedDB layer is not what we are testing here, and the emitter's
 * contract only touches `storeEvent`.
 */

import { SessionEmitter, DEFAULT_IDLE_GAP_MS } from '../SessionEmitter';
import type { BrowsingEvent } from '../../../shared/types';

class FakeOutbox {
  events: BrowsingEvent[] = [];
  async storeEvent(event: BrowsingEvent): Promise<void> {
    this.events.push(event);
  }
}

describe('SessionEmitter', () => {
  it('start() appends session_started with the supplied detectedBy and records the current session id', async () => {
    const outbox = new FakeOutbox();
    const emitter = new SessionEmitter({
      outbox: outbox as any,
      now: () => 1_000_000,
    });

    const eventId = await emitter.start('session_restore');

    expect(eventId).toMatch(/^session_/);
    expect(outbox.events).toHaveLength(1);
    const started = outbox.events[0];
    expect(started.type).toBe('session_started');
    expect(started.timestamp).toBe(1_000_000);
    expect(started.metadata.detectedBy).toBe('session_restore');
    expect(started.id).toBe(eventId);
    expect(emitter.currentSessionEventId()).toBe(eventId);
  });

  it('does not emit events when activity stays inside the idle window', async () => {
    let clock = 1_000_000;
    const outbox = new FakeOutbox();
    const emitter = new SessionEmitter({
      outbox: outbox as any,
      now: () => clock,
    });
    await emitter.start('session_restore');
    expect(outbox.events).toHaveLength(1);

    for (let i = 1; i <= 5; i++) {
      clock += 60_000; // 1 minute per tick, well under 15 min idle threshold
      await emitter.noteActivity(clock);
    }
    // Still just the initial session_started.
    expect(outbox.events).toHaveLength(1);
    expect(emitter.currentSessionEventId()).not.toBeNull();
  });

  it('closes the previous session at the last activity time and opens a new one on idle-gap detection', async () => {
    let clock = 1_000_000;
    const outbox = new FakeOutbox();
    const emitter = new SessionEmitter({
      outbox: outbox as any,
      now: () => clock,
      idleGapMs: 60_000, // shorter for the test
    });

    await emitter.start('session_restore');
    const firstSessionId = emitter.currentSessionEventId()!;

    // Two small ticks — under threshold, no new events.
    clock += 10_000;
    await emitter.noteActivity(clock);
    clock += 10_000;
    await emitter.noteActivity(clock);
    expect(outbox.events).toHaveLength(1);

    // The user goes away for two minutes.
    const lastActivity = clock;
    clock += 120_000;
    await emitter.noteActivity(clock);

    // We expect: session_ended at lastActivity, then session_started at now.
    expect(outbox.events).toHaveLength(3);
    const ended = outbox.events[1];
    const restarted = outbox.events[2];

    expect(ended.type).toBe('session_ended');
    expect(ended.timestamp).toBe(lastActivity);
    expect(ended.metadata.sessionNodeId).toBe(`session_${firstSessionId}`);

    expect(restarted.type).toBe('session_started');
    expect(restarted.timestamp).toBe(clock);
    expect(restarted.metadata.detectedBy).toBe('idle');

    // The current-session pointer advanced to the new session id.
    expect(emitter.currentSessionEventId()).toBe(restarted.id);
    expect(emitter.currentSessionEventId()).not.toBe(firstSessionId);
  });

  it('endManual() closes the current session and clears the pointer', async () => {
    let clock = 1_000_000;
    const outbox = new FakeOutbox();
    const emitter = new SessionEmitter({
      outbox: outbox as any,
      now: () => clock,
    });
    await emitter.start('manual');
    expect(emitter.currentSessionEventId()).not.toBeNull();

    clock += 5000;
    await emitter.endManual(clock);
    expect(outbox.events).toHaveLength(2);
    expect(outbox.events[1].type).toBe('session_ended');
    expect(outbox.events[1].timestamp).toBe(clock);
    expect(emitter.currentSessionEventId()).toBeNull();
  });

  it('noteActivity() bootstraps a session if one has not been started yet', async () => {
    const outbox = new FakeOutbox();
    const emitter = new SessionEmitter({
      outbox: outbox as any,
      now: () => 5_000_000,
    });
    // Skipping start() — first noteActivity() must open a session.
    await emitter.noteActivity(5_000_000);
    expect(outbox.events).toHaveLength(1);
    expect(outbox.events[0].type).toBe('session_started');
    expect(outbox.events[0].metadata.detectedBy).toBe('session_restore');
  });

  it('onEmit fires once per outbox append', async () => {
    const outbox = new FakeOutbox();
    const emitted: number[] = [];
    let counter = 0;
    const emitter = new SessionEmitter({
      outbox: outbox as any,
      now: () => 1_000_000,
      idleGapMs: 100,
      onEmit: () => { emitted.push(++counter); },
    });

    await emitter.start('session_restore');   // start -> +1 emit
    await emitter.noteActivity(1_000_050);    // within idle window, no emit
    await emitter.noteActivity(1_000_200);    // triggers end + new start = +2 emits
    await emitter.endManual(1_000_300);       // +1 emit

    expect(emitted).toEqual([1, 2, 3, 4]);
  });

  it('DEFAULT_IDLE_GAP_MS is 15 minutes', () => {
    expect(DEFAULT_IDLE_GAP_MS).toBe(15 * 60 * 1000);
  });

  it('a second start() closes the outstanding session before opening a new one', async () => {
    let clock = 1_000_000;
    const outbox = new FakeOutbox();
    const emitter = new SessionEmitter({
      outbox: outbox as any,
      now: () => clock,
    });
    const first = await emitter.start('session_restore');

    clock += 5_000;
    const second = await emitter.start('manual');
    expect(second).not.toBe(first);

    // Order: session_started (first) → session_ended (first) → session_started (second)
    const types = outbox.events.map((e) => e.type);
    expect(types).toEqual(['session_started', 'session_ended', 'session_started']);
    expect(outbox.events[1].metadata.sessionNodeId).toBe(`session_${first}`);
    expect(outbox.events[2].metadata.detectedBy).toBe('manual');
    expect(emitter.currentSessionEventId()).toBe(second);
  });
});
