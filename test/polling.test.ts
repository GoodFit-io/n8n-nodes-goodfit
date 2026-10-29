import { describe, expect, it, vi } from 'vitest';
import { MAX_CONSECUTIVE_FAILURES, pollUntilSettled } from '../nodes/GoodFit/shared/polling';
import { fakeClock } from './fakeClock';

type Status = { status: string };
const settings = { timeoutMs: 30_000, intervalMs: 5_000 };
const isSettled = (status: Status) => status.status !== 'Queued';

describe('pollUntilSettled', () => {
	it('polls each request until it settles', async () => {
		const responses: Record<string, string[]> = { a: ['Queued', 'Completed'], b: ['Skipped'] };
		const fetchStatus = vi.fn(async (id: string) => ({ status: responses[id].shift()! }));

		const outcomes = await pollUntilSettled(
			['a', 'b'],
			fetchStatus,
			isSettled,
			settings,
			fakeClock(),
		);

		expect(outcomes.get('a')).toEqual({ kind: 'settled', status: { status: 'Completed' } });
		expect(outcomes.get('b')).toEqual({ kind: 'settled', status: { status: 'Skipped' } });
		expect(fetchStatus).toHaveBeenCalledTimes(3);
	});

	it('times out requests still in flight at the deadline, keeping their last status', async () => {
		const clock = fakeClock();

		const outcomes = await pollUntilSettled(
			['a'],
			async () => ({ status: 'Queued' }),
			isSettled,
			settings,
			clock,
		);

		expect(outcomes.get('a')).toEqual({ kind: 'timedOut', status: { status: 'Queued' } });
		expect(clock.elapsed()).toBe(settings.timeoutMs);
	});

	it('rides out a transient failure and keeps polling', async () => {
		const fetchStatus = vi
			.fn()
			.mockRejectedValueOnce(new Error('502'))
			.mockResolvedValueOnce({ status: 'Completed' });

		const outcomes = await pollUntilSettled(['a'], fetchStatus, isSettled, settings, fakeClock());

		expect(outcomes.get('a')).toEqual({ kind: 'settled', status: { status: 'Completed' } });
	});

	it(`fails a request after ${MAX_CONSECUTIVE_FAILURES} failed checks in a row`, async () => {
		const failure = new Error('boom');
		const fetchStatus = vi.fn(async (id: string) => {
			if (id === 'a') throw failure;
			return { status: 'Completed' };
		});

		const outcomes = await pollUntilSettled(
			['a', 'b'],
			fetchStatus,
			isSettled,
			settings,
			fakeClock(),
		);

		expect(outcomes.get('a')).toEqual({ kind: 'failed', error: failure });
		expect(outcomes.get('b')).toEqual({ kind: 'settled', status: { status: 'Completed' } });
		expect(fetchStatus.mock.calls.filter(([id]) => id === 'a')).toHaveLength(
			MAX_CONSECUTIVE_FAILURES,
		);
	});

	it('times out a request whose checks keep failing until the deadline', async () => {
		const outcomes = await pollUntilSettled(
			['a'],
			vi.fn().mockRejectedValue(new Error('down')),
			isSettled,
			{ timeoutMs: 6_000, intervalMs: 5_000 },
			fakeClock(),
		);

		expect(outcomes.get('a')).toEqual({ kind: 'timedOut', status: undefined });
	});

	it('stops a round at the deadline rather than finishing it', async () => {
		const clock = fakeClock();
		const fetchStatus = vi.fn(async () => {
			await clock.wait(4_000);
			return { status: 'Queued' };
		});

		const outcomes = await pollUntilSettled(
			['a', 'b', 'c'],
			fetchStatus,
			isSettled,
			{ timeoutMs: 10_000, intervalMs: 5_000 },
			clock,
		);

		expect(fetchStatus).toHaveBeenCalledTimes(2);
		expect([...outcomes.values()].every((outcome) => outcome.kind === 'timedOut')).toBe(true);
		expect(clock.elapsed()).toBeLessThanOrEqual(13_000);
	});

	it('makes one last check at the deadline', async () => {
		const clock = fakeClock();
		const fetchStatus = vi.fn(async () => ({
			status: clock.elapsed() >= 9_500 ? 'Completed' : 'Queued',
		}));

		const outcomes = await pollUntilSettled(
			['a'],
			fetchStatus,
			isSettled,
			{ timeoutMs: 10_000, intervalMs: 3_000 },
			clock,
		);

		expect(outcomes.get('a')).toEqual({ kind: 'settled', status: { status: 'Completed' } });
		expect(fetchStatus).toHaveBeenCalledTimes(4);
	});

	it('stops at the first failed request when asked to', async () => {
		const clock = fakeClock();
		const outcomes = await pollUntilSettled(
			['a', 'b'],
			vi.fn(async (id: string) => {
				if (id === 'a') throw new Error('down');
				return { status: 'Queued' };
			}),
			isSettled,
			{ ...settings, stopOnFailure: true },
			clock,
		);

		expect(outcomes.get('a')?.kind).toBe('failed');
		expect(outcomes.get('b')?.kind).toBe('timedOut');
		expect(clock.elapsed()).toBe(MAX_CONSECUTIVE_FAILURES * settings.intervalMs);
	});

	it('polls a request id shared by several items once', async () => {
		const fetchStatus = vi.fn(async () => ({ status: 'Completed' }));

		await pollUntilSettled(['a', 'a'], fetchStatus, isSettled, settings, fakeClock());

		expect(fetchStatus).toHaveBeenCalledTimes(1);
	});
});
