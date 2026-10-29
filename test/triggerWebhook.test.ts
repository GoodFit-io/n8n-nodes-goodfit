import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { IDataObject, IWebhookFunctions } from 'n8n-workflow';
import { GoodFitTrigger } from '../nodes/GoodFitTrigger/GoodFitTrigger.node';

const SECRET = 'a-long-enough-signing-secret';

interface WebhookCall {
	payload: IDataObject;
	signature?: string;
	authentication?: 'none' | 'signature';
	events?: string[];
}

async function callWebhook(call: WebhookCall) {
	const rawBody = Buffer.from(JSON.stringify(call.payload));
	const sent: { status?: number; body?: unknown } = {};
	const parameters: IDataObject = {
		authentication: call.authentication ?? 'signature',
		events: call.events ?? ['account', 'contact'],
	};
	const context = {
		getNodeParameter: (name: string, fallback?: unknown) => parameters[name] ?? fallback,
		getCredentials: async () => ({ signingSecret: SECRET }),
		getBodyData: () => call.payload,
		getHeaderData: () => (call.signature ? { 'x-goodfit-hmac-sha256': call.signature } : {}),
		getRequestObject: () => ({ rawBody }),
		getResponseObject: () => ({
			status(code: number) {
				sent.status = code;
				return this;
			},
			json(body: unknown) {
				sent.body = body;
			},
		}),
		helpers: { returnJsonArray: (records: IDataObject[]) => records.map((json) => ({ json })) },
	} as unknown as IWebhookFunctions;

	const result = await new GoodFitTrigger().webhook.call(context);
	return { result, sent };
}

const sign = (payload: IDataObject) =>
	createHmac('sha256', SECRET).update(JSON.stringify(payload)).digest('hex');

const batch = {
	type: 'account',
	source: 'goodfit',
	body: [{ domain: 'a.io' }, { domain: 'b.io' }],
};

describe('Goodfit Trigger webhook', () => {
	it('starts the workflow with one item per signed record', async () => {
		const { result } = await callWebhook({ payload: batch, signature: sign(batch) });

		expect(result.webhookResponse).toEqual({ received: 2 });
		expect(result.workflowData).toEqual([
			[
				{ json: { event: 'account', domain: 'a.io' } },
				{ json: { event: 'account', domain: 'b.io' } },
			],
		]);
	});

	it('rejects a request whose signature does not match with a 401', async () => {
		const { result, sent } = await callWebhook({
			payload: batch,
			signature: sign({ tampered: true }),
		});

		expect(sent).toEqual({ status: 401, body: { error: 'Invalid signature' } });
		expect(result).toEqual({ noWebhookResponse: true });
	});

	it('accepts unsigned requests when authentication is off', async () => {
		const { result } = await callWebhook({ payload: batch, authentication: 'none' });

		expect(result.workflowData?.[0]).toHaveLength(2);
	});

	it('acknowledges events it does not listen for without starting the workflow', async () => {
		const contact = { type: 'contact', source: 'goodfit', body: { email: 'jane@example.com' } };

		const { result, sent } = await callWebhook({
			payload: contact,
			signature: sign(contact),
			events: ['account'],
		});

		expect(sent).toEqual({ status: 200, body: { ignored: true } });
		expect(result.workflowData).toBeUndefined();
	});

	it('does not start the workflow for an empty batch', async () => {
		const empty = { type: 'account', source: 'goodfit', body: [] };

		const { result } = await callWebhook({ payload: empty, signature: sign(empty) });

		expect(result).toEqual({ webhookResponse: { received: 0 } });
	});
});
