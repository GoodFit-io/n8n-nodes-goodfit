import type { Clock } from '../nodes/GoodFit/shared/polling';

export function fakeClock(): Clock & { elapsed(): number } {
	let now = 0;
	return {
		now: () => now,
		wait: async (ms) => {
			now += ms;
		},
		elapsed: () => now,
	};
}
