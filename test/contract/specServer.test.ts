import { describe, expect, it } from 'vitest';
import { companyPage } from './fixtures';
import { BASE_URL } from './runNode';
import { createSpecServer } from './specServer';

describe('createSpecServer', () => {
	it('reports undeclared and out-of-range query parameters', async () => {
		const server = createSpecServer(() => ({ statusCode: 200, body: companyPage([], null) }));

		await server.handle({
			method: 'GET',
			url: `${BASE_URL}/dataset/companies`,
			qs: { limit: 5000, page: 2 },
		});

		expect(server.violations).toEqual([
			'GET /dataset/companies: sends query parameter "page" the spec does not declare',
			'GET /dataset/companies: query parameter "limit"=5000 fails its schema',
		]);
	});

	it('reports a request body missing a required field', async () => {
		const server = createSpecServer(() => ({ statusCode: 200, body: { sizeCompanies: 0, companies: [] } }));

		await server.handle({
			method: 'POST',
			url: `${BASE_URL}/dataset/segments/preview`,
			body: { sample: 2 },
		});

		expect(server.violations).toEqual([
			"POST /dataset/segments/preview: request body (root) must have required property 'filters'",
		]);
	});

	it('reports a test fixture that does not match the documented response', async () => {
		const server = createSpecServer(() => ({ statusCode: 200, body: { companies: [] } }));

		await server.handle({ method: 'GET', url: `${BASE_URL}/dataset/companies` });

		expect(server.violations).toContain(
			"GET /dataset/companies: test's 200 response (root) must have required property 'totalCompanies'",
		);
	});

	it('reports an endpoint the spec does not have', async () => {
		const server = createSpecServer(() => ({ statusCode: 200, body: {} }));

		await server.handle({ method: 'DELETE', url: `${BASE_URL}/dataset/companies/goodfit.io` });

		expect(server.violations).toEqual([
			'DELETE /dataset/companies/goodfit.io: not in the dataset OpenAPI spec',
		]);
	});

	it('reports a call to an API with no committed document', async () => {
		const server = createSpecServer(() => ({ statusCode: 200, body: {} }));

		await server.handle({ method: 'GET', url: `${BASE_URL}/unknown/thing` });

		expect(server.violations).toEqual([
			'GET /unknown/thing: no OpenAPI document for the unknown API in openapi/',
		]);
	});

	it('matches a literal path before a templated one', async () => {
		const server = createSpecServer(() => ({ statusCode: 200, body: { fields: [] } }));

		await server.handle({ method: 'GET', url: `${BASE_URL}/dataset/companies/fields` });

		expect(server.violations).toEqual([]);
	});
});
