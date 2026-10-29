import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-goodfit-hmac-sha256';

export function isValidSignature(
	rawBody: Buffer | string,
	signature: string | undefined,
	secret: string,
): boolean {
	if (!signature) return false;
	const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
	const received = Buffer.from(signature);
	return expected.length === received.length && timingSafeEqual(expected, received);
}
