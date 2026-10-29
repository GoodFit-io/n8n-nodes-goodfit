import { describe, expect, it } from 'vitest';
import { pacer } from '../nodes/GoodFit/shared/pacing';
import { fakeClock } from './fakeClock';

describe('pacer', () => {
	it('lets the first call through and spaces the rest by the interval', async () => {
		const clock = fakeClock();
		const pace = pacer(500, clock);

		await pace();
		await pace();
		await pace();

		expect(clock.elapsed()).toBe(1000);
	});

	it('does not wait when enough time has already passed', async () => {
		const clock = fakeClock();
		const pace = pacer(500, clock);

		await pace();
		await clock.wait(800);
		await pace();

		expect(clock.elapsed()).toBe(800);
	});
});
