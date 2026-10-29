import { describe, expect, it } from 'vitest';
import { GoodFitApi } from '../../credentials/GoodFitApi.credentials';
import { credits } from './fixtures';
import { BASE_URL, runNode } from './runNode';
import { createSpecServer } from './specServer';

describe('Organisation API contract', () => {
	it('Credit → Get Balances returns the credit balances', async () => {
		const run = await runNode({
			parameters: { resource: 'credit', operation: 'getBalances' },
			respond: () => ({ statusCode: 200, body: credits }),
		});

		expect(run.violations).toEqual([]);
		expect(run.output).toEqual([credits]);
	});

	it('the credential test calls an endpoint the spec documents', async () => {
		const { request } = new GoodFitApi().test;
		const server = createSpecServer(() => ({ statusCode: 200, body: credits }));

		await server.handle({ method: request.method, url: `${BASE_URL}${request.url}` });

		expect(server.violations).toEqual([]);
	});
});
