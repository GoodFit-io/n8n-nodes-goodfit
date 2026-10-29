import { describe, expect, it } from 'vitest';
import type { IDataObject, ILoadOptionsFunctions } from 'n8n-workflow';
import { criteriaLoadOptions } from '../../nodes/GoodFit/shared/criteria';
import { companyPage } from './fixtures';
import { BASE_URL, runNode } from './runNode';
import { createSpecServer, type CapturedRequest, type Responder } from './specServer';

const DATA_POINTS = [
	{
		fieldName: 'firmographics/employee_count',
		displayName: 'Employee count',
		fieldType: 'Integer',
		operators: ['exists', 'equalTo', 'gt', 'between'],
		description: 'How many people work there',
		isIntel: false,
	},
	{
		fieldName: 'country',
		displayName: 'Country',
		fieldType: 'Picklist',
		operators: ['stringEqualOneOf', 'stringNotEqualOneOf'],
		description: null,
		isIntel: false,
	},
	{
		fieldName: 'intel/sells_to_enterprise',
		displayName: 'Sells to enterprises?',
		fieldType: 'Boolean',
		operators: ['booleanTrue', 'booleanFalse'],
		description: null,
		isIntel: true,
	},
];

function datasetApi({ path }: CapturedRequest) {
	if (path === '/dataset/companies/fields')
		return { statusCode: 200, body: { fields: DATA_POINTS } };
	return { statusCode: 200, body: companyPage(['goodfit.io'], null) };
}

const conditions = (...condition: IDataObject[]) => ({ condition });

describe('Criteria builder', () => {
	it('Company → Search turns the conditions into a filter group', async () => {
		const run = await runNode({
			parameters: {
				resource: 'company',
				operation: 'search',
				returnAll: true,
				match: 'and',
				conditions: conditions(
					{ dataPoint: 'country', operator: 'stringEqualOneOf', value: 'US, GB' },
					{
						dataPoint: 'firmographics/employee_count',
						operator: 'between',
						value: '50',
						secondValue: '500',
					},
					{ dataPoint: 'intel/sells_to_enterprise', operator: 'booleanTrue' },
				),
			},
			respond: datasetApi,
		});

		expect(run.violations).toEqual([]);
		expect(run.requests.map((request) => request.path)).toEqual(['/dataset/companies/search']);
		expect(run.requests[0].body).toMatchObject({
			filters: {
				id: 'root',
				combinator: 'and',
				rules: [
					{ id: 'r1', field: 'country', operator: 'stringEqualOneOf', value: ['US', 'GB'] },
					{
						id: 'r2',
						field: 'firmographics/employee_count',
						operator: 'between',
						value: [50, 500],
					},
					{ id: 'r3', field: 'intel/sells_to_enterprise', operator: 'booleanTrue' },
				],
			},
		});
	});

	it('looks up data point types once so Equals sends a number for a numeric data point', async () => {
		const run = await runNode({
			parameters: {
				resource: 'company',
				operation: 'search',
				returnAll: true,
				match: 'or',
				conditions: conditions({
					dataPoint: 'firmographics/employee_count',
					operator: 'equalTo',
					value: '120',
				}),
			},
			respond: datasetApi,
		});

		expect(run.violations).toEqual([]);
		expect(run.requests.map((request) => request.path)).toEqual([
			'/dataset/companies/fields',
			'/dataset/companies/search',
		]);
		expect(run.requests[1].body).toMatchObject({
			filters: { combinator: 'or', rules: [{ operator: 'equalTo', value: 120 }] },
		});
	});

	it('Segment → Create sends builder criteria as the segment filters', async () => {
		const run = await runNode({
			parameters: {
				resource: 'segment',
				operation: 'create',
				name: 'US companies',
				match: 'and',
				conditions: conditions({ dataPoint: 'country', operator: 'stringEqualOneOf', value: 'US' }),
				additionalFields: {},
				waitForCompletion: false,
			},
			respond: () => ({
				statusCode: 202,
				body: {
					segment: {
						id: '3d2c1b0a-9f8e-4d7c-8b6a-5f4e3d2c1b0a',
						name: 'US companies',
						isDynamic: false,
						status: 'UPDATING',
						sizeCompanies: null,
						sizeContacts: null,
						lastRefreshedAt: null,
						createdAt: '2026-10-09T09:59:00.000Z',
						updatedAt: '2026-10-09T09:59:00.000Z',
						filters: {},
						excludeDomains: [],
						companyLimit: null,
					},
				},
			}),
		});

		expect(run.violations).toEqual([]);
		expect(run.requests[0].body).toMatchObject({
			filters: { rules: [{ field: 'country', operator: 'stringEqualOneOf', value: ['US'] }] },
		});
	});

	it('reports a malformed value against the item instead of calling the API', async () => {
		const run = await runNode({
			parameters: {
				resource: 'company',
				operation: 'search',
				returnAll: true,
				match: 'and',
				conditions: conditions({
					dataPoint: 'firmographics/employee_count',
					operator: 'gt',
					value: 'lots',
				}),
			},
			respond: datasetApi,
		});

		expect(run.requests).toEqual([]);
		expect((run.error as Error).message).toBe('"lots" is not a number');
	});
});

const forbidden = () => ({ statusCode: 403, body: { error: 'Forbidden', code: 'FORBIDDEN' } });

function loadOptionsContext(dataPoint?: string, respond: Responder = datasetApi) {
	const server = createSpecServer(respond);
	const context = {
		getNode: () => ({
			id: 'goodfit',
			name: 'Goodfit',
			type: 'goodFit',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		getCredentials: async () => ({ apiKey: 'test-key', baseUrl: BASE_URL }),
		getCurrentNodeParameter: (path: string) => (path === '&dataPoint' ? dataPoint : undefined),
		helpers: {
			httpRequestWithAuthentication: (_credential: string, options: never) =>
				server.handle(options),
		},
	} as unknown as ILoadOptionsFunctions;
	return { context, server };
}

describe('Criteria builder dropdowns', () => {
	it('lists the dataset’s data points by their app names, marking intel', async () => {
		const { context, server } = loadOptionsContext();

		const options = await criteriaLoadOptions.getDataPoints.call(context);

		expect(server.violations).toEqual([]);
		expect(options).toEqual([
			{ name: 'Country', value: 'country', description: undefined },
			{
				name: 'Employee count',
				value: 'firmographics/employee_count',
				description: 'How many people work there',
			},
			{
				name: 'Sells to enterprises? (intel)',
				value: 'intel/sells_to_enterprise',
				description: undefined,
			},
		]);
	});

	it('offers only the operators the chosen data point supports, in plain English', async () => {
		const { context } = loadOptionsContext('country');

		const options = await criteriaLoadOptions.getDataPointOperators.call(context);

		expect(options).toEqual([
			{ name: 'Is one of', value: 'stringEqualOneOf' },
			{ name: 'Is not one of', value: 'stringNotEqualOneOf' },
		]);
	});

	it('explains a key without Dataset API access instead of failing silently', async () => {
		const { context, server } = loadOptionsContext(undefined, forbidden);

		await expect(criteriaLoadOptions.getDataPoints.call(context)).rejects.toThrow(
			'Couldn’t load your data points: Forbidden. This API key can’t use this Goodfit API. Create a key with the right scope in Goodfit under Settings → API Keys, or ask your account manager to enable the API.',
		);
		expect(server.violations).toEqual([]);
	});
});

describe('Access errors during a run', () => {
	it('tells the user how to fix a key without access to the API', async () => {
		const run = await runNode({
			parameters: { resource: 'company', operation: 'getFields' },
			respond: forbidden,
		});

		expect(run.violations).toEqual([]);
		expect((run.error as { description?: string }).description).toBe(
			'This API key can’t use this Goodfit API. Create a key with the right scope in Goodfit under Settings → API Keys, or ask your account manager to enable the API.',
		);
	});
});
