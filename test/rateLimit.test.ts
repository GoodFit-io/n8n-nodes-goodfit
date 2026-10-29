import { describe, expect, it, vi } from 'vitest';
import {
	retryAfterMs,
	sendHonouringRetryAfter,
	type RawResponse,
} from '../nodes/GoodFit/shared/rateLimit';

const ok: RawResponse = { statusCode: 200, headers: {}, body: { ok: true } };
const limited = (retryAfter?: string): RawResponse => ({
	statusCode: 429,
	headers: retryAfter === undefined ? {} : { 'Retry-After': retryAfter },
	body: { error: 'Too many requests', code: 'RATE_LIMITED' },
});

describe('sendHonouringRetryAfter', () => {
	it('waits for Retry-After then retries a rate-limited request', async () => {
		const send = vi.fn().mockResolvedValueOnce(limited('3')).mockResolvedValueOnce(ok);
		const wait = vi.fn().mockResolvedValue(undefined);

		const response = await sendHonouringRetryAfter(send, wait);

		expect(response).toBe(ok);
		expect(wait).toHaveBeenCalledWith(3000);
		expect(send).toHaveBeenCalledTimes(2);
	});

	it('returns the 429 after five attempts so the caller can surface it', async () => {
		const send = vi.fn().mockResolvedValue(limited('1'));
		const wait = vi.fn().mockResolvedValue(undefined);

		const response = await sendHonouringRetryAfter(send, wait);

		expect(response.statusCode).toBe(429);
		expect(send).toHaveBeenCalledTimes(5);
		expect(wait).toHaveBeenCalledTimes(4);
	});

	it('does not retry other errors', async () => {
		const notFound: RawResponse = { statusCode: 404, headers: {}, body: {} };
		const send = vi.fn().mockResolvedValue(notFound);

		expect(await sendHonouringRetryAfter(send, vi.fn())).toBe(notFound);
		expect(send).toHaveBeenCalledTimes(1);
	});
});

describe('retryAfterMs', () => {
	it('reads the header case-insensitively', () => {
		expect(retryAfterMs({ 'retry-after': '2' })).toBe(2000);
	});

	it('falls back to one second when the header is missing or unusable', () => {
		expect(retryAfterMs({})).toBe(1000);
		expect(retryAfterMs({ 'retry-after': 'soon' })).toBe(1000);
	});
});
