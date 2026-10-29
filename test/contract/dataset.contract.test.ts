import { describe, expect, it } from 'vitest';
import { NodeApiError } from 'n8n-workflow';
import { company, companyPage, contact, notFound } from './fixtures';
import { runNode } from './runNode';

describe('Dataset API contract', () => {
	it('Company → Get reads one company by domain', async () => {
		const run = await runNode({
			parameters: { resource: 'company', operation: 'get', domain: 'goodfit.io' },
			respond: () => ({ statusCode: 200, body: { company: company('goodfit.io') } }),
		});

		expect(run.violations).toEqual([]);
		expect(run.output).toEqual([company('goodfit.io')]);
	});

	it('Company → Get surfaces the NOT_FOUND envelope as a node error', async () => {
		const run = await runNode({
			parameters: { resource: 'company', operation: 'get', domain: 'missing.io' },
			respond: () => ({ statusCode: 404, body: notFound }),
		});

		expect(run.violations).toEqual([]);
		expect(run.error).toBeInstanceOf(NodeApiError);
		expect((run.error as NodeApiError).message).toBe(notFound.error);
	});

	it('Company → Get Many follows the iterator across pages with the since filters', async () => {
		const run = await runNode({
			parameters: {
				resource: 'company',
				operation: 'getAll',
				returnAll: true,
				listFilters: {
					updatedSince: '2026-09-01T00:00:00.000Z',
					addedSince: '2026-08-01T00:00:00.000Z',
				},
			},
			respond: ({ query }) => ({
				statusCode: 200,
				body: query.iterator
					? companyPage(['c.io'], null)
					: companyPage(['a.io', 'b.io'], 'page-2'),
			}),
		});

		expect(run.violations).toEqual([]);
		expect(run.output.map((row) => row.domain)).toEqual(['a.io', 'b.io', 'c.io']);
		expect(run.requests[1].query).toMatchObject({
			iterator: 'page-2',
			updated_since: '2026-09-01T00:00:00.000Z',
		});
	});

	it('Company → Get Many asks for no more than the limit', async () => {
		const run = await runNode({
			parameters: {
				resource: 'company',
				operation: 'getAll',
				returnAll: false,
				limit: 2,
				listFilters: {},
			},
			respond: () => ({ statusCode: 200, body: companyPage(['a.io', 'b.io'], 'more') }),
		});

		expect(run.violations).toEqual([]);
		expect(run.requests).toHaveLength(1);
		expect(run.requests[0].query.limit).toBe(2);
	});

	it('Company → Search posts the filter group and pages through results', async () => {
		const filters = {
			id: 'root',
			combinator: 'and',
			rules: [{ id: 'r1', field: 'country', operator: 'equalTo', value: 'US' }],
		};
		const run = await runNode({
			parameters: {
				resource: 'company',
				operation: 'search',
				criteriaMode: 'json',
				filters: JSON.stringify(filters),
				returnAll: true,
			},
			respond: ({ body }) => ({
				statusCode: 200,
				body: body?.iterator ? companyPage(['b.io'], null) : companyPage(['a.io'], 'next'),
			}),
		});

		expect(run.violations).toEqual([]);
		expect(run.requests[0].body).toMatchObject({ filters });
		expect(run.output).toHaveLength(2);
	});

	it('Contact → Get Many filters by company', async () => {
		const run = await runNode({
			parameters: {
				resource: 'contact',
				operation: 'getAll',
				returnAll: false,
				limit: 10,
				listFilters: { companyId: 'company-goodfit.io' },
			},
			respond: () => ({
				statusCode: 200,
				body: {
					contacts: [contact('c1', 'company-goodfit.io')],
					totalContacts: 1,
					hasMoreResults: false,
					nextIterator: null,
				},
			}),
		});

		expect(run.violations).toEqual([]);
		expect(run.requests[0].query).toMatchObject({ company_id: 'company-goodfit.io' });
		expect(run.output).toEqual([contact('c1', 'company-goodfit.io')]);
	});

	it('Company → Get Many pairs every output with the input item that asked for it', async () => {
		const run = await runNode({
			items: [{}, {}],
			parameters: { resource: 'company', operation: 'getAll', returnAll: true, listFilters: {} },
			respond: () => ({ statusCode: 200, body: companyPage(['a.io', 'b.io'], null) }),
		});

		expect(run.violations).toEqual([]);
		expect(run.items.map((item) => item.pairedItem)).toEqual([
			{ item: 0 },
			{ item: 0 },
			{ item: 1 },
			{ item: 1 },
		]);
	});

	it('Company → Get Data Points returns one item per data point with its filter operators', async () => {
		const fields = [
			{
				fieldName: 'firmographics/employee_count',
				displayName: 'Employee count',
				isIntel: false,
				fieldType: 'Number',
				operators: ['exists', 'gt', 'lt'],
				description: 'How many people work there',
			},
			{
				fieldName: 'country',
				displayName: 'Country',
				isIntel: false,
				fieldType: 'Picklist',
				operators: ['stringEqualOneOf'],
				description: null,
			},
		];
		const run = await runNode({
			parameters: { resource: 'company', operation: 'getFields' },
			respond: () => ({ statusCode: 200, body: { fields } }),
		});

		expect(run.violations).toEqual([]);
		expect(run.requests.map((request) => request.path)).toEqual(['/dataset/companies/fields']);
		expect(run.output).toEqual(fields);
	});

	it('Contact → Get Data Points returns one item per data point', async () => {
		const fields = [
			{
				fieldName: 'position',
				displayName: 'Position',
				fieldType: 'String',
				description: 'The contact’s position',
			},
		];
		const run = await runNode({
			parameters: { resource: 'contact', operation: 'getFields' },
			respond: () => ({ statusCode: 200, body: { fields } }),
		});

		expect(run.violations).toEqual([]);
		expect(run.requests.map((request) => request.path)).toEqual(['/dataset/contacts/fields']);
		expect(run.output).toEqual(fields);
	});
});
