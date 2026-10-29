import { describe, expect, it, vi } from 'vitest';
import type { IDataObject } from 'n8n-workflow';
import { runAsyncBatch, type AsyncBatchSpec } from '../nodes/GoodFit/shared/asyncBatch';
import { fakeClock } from './fakeClock';

type Status = IDataObject & { status: string };
const poll = { timeoutMs: 20_000, intervalMs: 5_000 };
const waiting = { waitForCompletion: true, continueOnFail: true, poll };

function specFor(
	statuses: Record<string, Status>,
	overrides: Partial<AsyncBatchSpec<Status>> = {},
) {
	return {
		requestBody: vi.fn((itemIndex: number) => ({ domain: `company-${itemIndex}.io` })),
		submit: vi.fn(async (itemIndex: number) => ({ success: true, requestId: `req-${itemIndex}` })),
		fetchStatus: vi.fn(async (requestId: string) => statuses[requestId]),
		isSettled: (status: Status) => status.status !== 'Queued',
		toOutput: vi.fn(async (_itemIndex: number, status: Status) => ({ ...status, enriched: true })),
		...overrides,
	};
}

describe('runAsyncBatch', () => {
	it('submits every item before polling, then outputs each settled result', async () => {
		const spec = specFor({ 'req-0': { status: 'Completed' }, 'req-1': { status: 'Skipped' } });

		const results = await runAsyncBatch(2, spec, waiting, fakeClock());

		expect(vi.mocked(spec.submit).mock.invocationCallOrder[1]).toBeLessThan(
			vi.mocked(spec.fetchStatus).mock.invocationCallOrder[0],
		);
		expect(spec.submit).toHaveBeenCalledWith(0, { domain: 'company-0.io' });
		expect(results).toEqual([
			{ json: { status: 'Completed', enriched: true, timedOut: false } },
			{ json: { status: 'Skipped', enriched: true, timedOut: false } },
		]);
	});

	it('returns the submit response when not waiting', async () => {
		const spec = specFor({});

		const results = await runAsyncBatch(
			1,
			spec,
			{ ...waiting, waitForCompletion: false },
			fakeClock(),
		);

		expect(results).toEqual([{ json: { success: true, requestId: 'req-0' } }]);
		expect(spec.fetchStatus).not.toHaveBeenCalled();
	});

	it('with Continue On Fail, keeps a failed submission as that item’s error and enriches the rest', async () => {
		const failure = new Error('Domain is invalid');
		const spec = specFor(
			{ 'req-1': { status: 'Completed' } },
			{
				submit: vi.fn(async (itemIndex: number) => {
					if (itemIndex === 0) throw failure;
					return { requestId: `req-${itemIndex}` };
				}),
			},
		);

		const results = await runAsyncBatch(2, spec, waiting, fakeClock());

		expect(results[0]).toEqual({ error: failure });
		expect(results[1]).toEqual({ json: { status: 'Completed', enriched: true, timedOut: false } });
	});

	it('without Continue On Fail, throws before submitting anything when any item is invalid', async () => {
		const invalid = new Error(
			'Provide a LinkedIn URL, a work email, or a first name, last name and company',
		);
		const spec = specFor(
			{},
			{
				requestBody: vi.fn((itemIndex: number) => {
					if (itemIndex === 2) throw invalid;
					return {};
				}),
			},
		);

		await expect(
			runAsyncBatch(3, spec, { ...waiting, continueOnFail: false }, fakeClock()),
		).rejects.toBe(invalid);
		expect(spec.submit).not.toHaveBeenCalled();
	});

	it('without Continue On Fail, stops submitting at the first rejected item and never polls', async () => {
		const rejected = new Error('Personal email domain');
		const spec = specFor(
			{},
			{
				submit: vi.fn(async (itemIndex: number) => {
					if (itemIndex === 1) throw rejected;
					return { requestId: `req-${itemIndex}` };
				}),
			},
		);

		await expect(
			runAsyncBatch(4, spec, { ...waiting, continueOnFail: false }, fakeClock()),
		).rejects.toBe(rejected);
		expect(spec.submit).toHaveBeenCalledTimes(2);
		expect(spec.fetchStatus).not.toHaveBeenCalled();
	});

	it('without Continue On Fail, stops polling at the first request that fails and builds no output', async () => {
		const down = new Error('status check failed');
		const spec = specFor(
			{},
			{
				fetchStatus: vi.fn(async (requestId: string) => {
					if (requestId === 'req-1') throw down;
					return { status: 'Queued' };
				}),
			},
		);
		const clock = fakeClock();

		await expect(runAsyncBatch(3, spec, { ...waiting, continueOnFail: false }, clock)).rejects.toBe(
			down,
		);
		expect(spec.toOutput).not.toHaveBeenCalled();
		expect(clock.elapsed()).toBeLessThan(poll.timeoutMs);
	});

	it('without Continue On Fail, stops building output at the first item that fails', async () => {
		const forbidden = new Error('Forbidden');
		const spec = specFor(
			{
				'req-0': { status: 'Completed' },
				'req-1': { status: 'Completed' },
				'req-2': { status: 'Completed' },
			},
			{ toOutput: vi.fn().mockRejectedValue(forbidden) },
		);

		await expect(
			runAsyncBatch(3, spec, { ...waiting, continueOnFail: false }, fakeClock()),
		).rejects.toBe(forbidden);
		expect(spec.toOutput).toHaveBeenCalledTimes(1);
	});

	it('flags items still queued at the timeout without transforming them', async () => {
		const spec = specFor({ 'req-0': { status: 'Queued', requestId: 'req-0' } });

		const results = await runAsyncBatch(1, spec, waiting, fakeClock());

		expect(results).toEqual([{ json: { status: 'Queued', requestId: 'req-0', timedOut: true } }]);
		expect(spec.toOutput).not.toHaveBeenCalled();
	});

	it('gives every item that shares a request id the same result', async () => {
		const spec = specFor(
			{ shared: { status: 'Completed' } },
			{ submit: vi.fn(async () => ({ requestId: 'shared' })) },
		);

		const results = await runAsyncBatch(2, spec, waiting, fakeClock());

		expect(spec.fetchStatus).toHaveBeenCalledTimes(1);
		expect(results).toEqual([
			{ json: { status: 'Completed', enriched: true, timedOut: false } },
			{ json: { status: 'Completed', enriched: true, timedOut: false } },
		]);
	});

	it('reports an error raised while building the output against that item', async () => {
		const failure = new Error('dataset unavailable');
		const spec = specFor(
			{ 'req-0': { status: 'Completed' } },
			{ toOutput: vi.fn().mockRejectedValue(failure) },
		);

		const results = await runAsyncBatch(1, spec, waiting, fakeClock());

		expect(results).toEqual([{ error: failure }]);
	});
});
