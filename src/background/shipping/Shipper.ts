/**
 * Ship BrowsingEvents to an external TabKiller server.
 *
 * Pilot-shape: fire-and-forget POST per event. No retry queue, no
 * backpressure, no batching. If a POST fails we log (rate-limited) and
 * move on; the event stays in the local outbox and graph either way,
 * so shipping-side loss doesn't affect local capture. The server is
 * expected to dedupe on event.id — resends after a restart are safe.
 *
 * A real shipping implementation would batch, keep a durable cursor
 * of the last-shipped event id, and retry with exponential backoff.
 * That work lands when the pilot proves the shape is worth it.
 */

import type { BrowsingEvent } from '../../shared/types';

export class Shipper {
  private readonly endpoint: string;
  private failCount = 0;

  constructor(shipTo: string) {
    this.endpoint = shipTo.replace(/\/$/, '') + '/events';
  }

  /**
   * POST an event to the server. Does not throw — network / server
   * failures are logged with rate-limiting so a down server doesn't
   * flood the console.
   */
  enqueue(event: BrowsingEvent): void {
    void fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([event]),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (this.failCount > 0) {
          console.log('TabKiller shipper recovered after', this.failCount, 'failures');
        }
        this.failCount = 0;
      })
      .catch((err) => {
        this.failCount++;
        if (this.failCount === 1 || this.failCount % 20 === 0) {
          console.warn('TabKiller shipping failed', {
            endpoint: this.endpoint,
            failCount: this.failCount,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
  }
}
