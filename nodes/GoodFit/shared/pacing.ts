import { systemClock, type Clock } from './polling';

export function pacer(minIntervalMs: number, clock: Clock = systemClock): () => Promise<void> {
	let lastCall = Number.NEGATIVE_INFINITY;
	return async () => {
		const waitMs = lastCall + minIntervalMs - clock.now();
		if (waitMs > 0) await clock.wait(waitMs);
		lastCall = clock.now();
	};
}
