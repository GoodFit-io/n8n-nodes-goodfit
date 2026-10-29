import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isSubscribed, recordsFrom } from '../nodes/GoodFitTrigger/payload';
import { isValidSignature } from '../nodes/GoodFitTrigger/signature';

const secret = 'shh';
const signed = (body: string) => createHmac('sha256', secret).update(body).digest('hex');

describe('isValidSignature', () => {
	const rawBody = JSON.stringify({
		type: 'account',
		source: 'goodfit',
		body: { domain: 'goodfit.io' },
	});

	it('accepts the signature Goodfit computes over the raw body', () => {
		expect(isValidSignature(Buffer.from(rawBody), signed(rawBody), secret)).toBe(true);
	});

	it('rejects a missing, malformed or mismatched signature', () => {
		expect(isValidSignature(rawBody, undefined, secret)).toBe(false);
		expect(isValidSignature(rawBody, 'abc', secret)).toBe(false);
		expect(isValidSignature(rawBody, signed(`${rawBody} `), secret)).toBe(false);
	});
});

describe('recordsFrom', () => {
	it('emits one record for a single-record body', () => {
		expect(recordsFrom({ type: 'account', body: { domain: 'goodfit.io' } })).toEqual([
			{ event: 'account', domain: 'goodfit.io' },
		]);
	});

	it('splits a batched body into one record each', () => {
		const envelope = { type: 'contact', body: [{ email: 'a@x.io' }, { email: 'b@x.io' }] };

		expect(recordsFrom(envelope)).toEqual([
			{ event: 'contact', email: 'a@x.io' },
			{ event: 'contact', email: 'b@x.io' },
		]);
	});

	it('keeps the envelope’s event type even if a record has its own event field', () => {
		expect(recordsFrom({ type: 'contact', body: { event: 'webinar', email: 'a@x.io' } })).toEqual([
			{ event: 'contact', email: 'a@x.io' },
		]);
	});

	it('emits nothing when there is no body', () => {
		expect(recordsFrom({ type: 'account' })).toEqual([]);
	});
});

describe('isSubscribed', () => {
	it('only passes events the trigger listens for', () => {
		expect(isSubscribed({ type: 'contact' }, ['account'])).toBe(false);
		expect(isSubscribed({ type: 'contact' }, ['account', 'contact'])).toBe(true);
	});
});
