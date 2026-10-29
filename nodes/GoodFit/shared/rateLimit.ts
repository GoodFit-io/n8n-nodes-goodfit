import { sleep } from 'n8n-workflow';
import type { IDataObject } from 'n8n-workflow';

export interface RawResponse {
	statusCode: number;
	headers: IDataObject;
	body: unknown;
}

const MAX_ATTEMPTS = 5;
const RATE_LIMITED = 429;

export async function sendHonouringRetryAfter(
	send: () => Promise<RawResponse>,
	wait: (ms: number) => Promise<void> = sleep,
): Promise<RawResponse> {
	for (let attempt = 1; ; attempt++) {
		const response = await send();
		if (response.statusCode !== RATE_LIMITED || attempt === MAX_ATTEMPTS) return response;
		await wait(retryAfterMs(response.headers));
	}
}

export function retryAfterMs(headers: IDataObject): number {
	const seconds = Number(headerValue(headers, 'retry-after'));
	return (Number.isFinite(seconds) && seconds > 0 ? seconds : 1) * 1000;
}

function headerValue(headers: IDataObject, name: string): unknown {
	const key = Object.keys(headers).find((header) => header.toLowerCase() === name);
	return key === undefined ? undefined : headers[key];
}
