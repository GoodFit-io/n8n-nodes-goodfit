import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDataObject } from 'n8n-workflow';
import { runNode } from './runNode';
import type { CapturedRequest } from './specServer';

vi.mock('n8n-workflow', async (importOriginal) => ({
	...(await importOriginal<typeof import('n8n-workflow')>()),
	sleep: async (ms: number) => {
		vi.setSystemTime(Date.now() + ms);
	},
}));

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
});

const SEGMENT_ID = '3d2c1b0a-9f8e-4d7c-8b6a-5f4e3d2c1b0a';
const CRITERIA = {
	id: 'root',
	combinator: 'and',
	rules: [{ id: 'r1', field: 'country', operator: 'equalTo', value: 'US' }],
};
const waitBriefly = { waitForCompletion: true, timeoutSeconds: 60, pollIntervalSeconds: 5 };

function segment(status: string, overrides: IDataObject = {}) {
	return {
		id: SEGMENT_ID,
		name: 'US companies',
		isDynamic: false,
		status,
		sizeCompanies: status === 'READY' ? 1200 : null,
		sizeContacts: status === 'READY' ? 0 : null,
		lastRefreshedAt: status === 'READY' ? '2026-10-09T10:00:00.000Z' : null,
		createdAt: '2026-10-09T09:59:00.000Z',
		updatedAt: '2026-10-09T10:00:00.000Z',
		filters: CRITERIA,
		excludeDomains: [],
		companyLimit: null,
		...overrides,
	};
}

const LIST_ITEM_KEYS = [
	'id',
	'name',
	'isDynamic',
	'status',
	'sizeCompanies',
	'sizeContacts',
	'lastRefreshedAt',
	'createdAt',
	'updatedAt',
] as const;

function listItem(status: string) {
	const full = segment(status);
	return Object.fromEntries(LIST_ITEM_KEYS.map((key) => [key, full[key]]));
}

function segmentApi(changeStatus: number, settlesAs = 'READY') {
	let checks = 0;
	return ({ method, path }: CapturedRequest) => {
		if (method === 'GET' && path === `/dataset/segments/${SEGMENT_ID}`) {
			checks++;
			return { statusCode: 200, body: { segment: segment(checks >= 2 ? settlesAs : 'UPDATING') } };
		}
		return { statusCode: changeStatus, body: { segment: segment('UPDATING') } };
	};
}

describe('Segments API contract', () => {
	it('Create sends the name, criteria and settings, then waits until the segment is ready', async () => {
		const run = await runNode({
			parameters: {
				resource: 'segment',
				operation: 'create',
				criteriaMode: 'json',
				name: 'US companies',
				criteria: JSON.stringify(CRITERIA),
				additionalFields: {
					isDynamic: true,
					excludeDomains: 'goodfit.io, example.com',
					maxCompanies: 500,
					orderBy: 'firmographics/employee_count',
					orderDirection: 'DESC',
				},
				...waitBriefly,
			},
			respond: segmentApi(202),
		});

		expect(run.violations).toEqual([]);
		expect(run.requests[0]).toMatchObject({
			method: 'POST',
			path: '/dataset/segments',
			body: {
				name: 'US companies',
				filters: CRITERIA,
				isDynamic: true,
				excludeDomains: ['goodfit.io', 'example.com'],
				companyLimit: { max: 500, orderBy: 'firmographics/employee_count', orderDirection: 'DESC' },
			},
		});
		expect(run.output).toEqual([expect.objectContaining({ status: 'READY', timedOut: false })]);
	});

	it('Create returns the segment straight away when not waiting', async () => {
		const run = await runNode({
			parameters: {
				resource: 'segment',
				operation: 'create',
				criteriaMode: 'json',
				name: 'US companies',
				criteria: JSON.stringify(CRITERIA),
				additionalFields: {},
				waitForCompletion: false,
			},
			respond: segmentApi(202),
		});

		expect(run.violations).toEqual([]);
		expect(run.requests).toHaveLength(1);
		expect(run.output).toEqual([segment('UPDATING')]);
	});

	it('Refresh sends no body and reports a failed calculation as the segment’s status', async () => {
		const run = await runNode({
			parameters: {
				resource: 'segment',
				operation: 'refresh',
				segmentId: SEGMENT_ID,
				...waitBriefly,
			},
			respond: segmentApi(202, 'FAILED'),
		});

		expect(run.violations).toEqual([]);
		expect(run.requests[0]).toMatchObject({
			method: 'POST',
			path: `/dataset/segments/${SEGMENT_ID}/refresh`,
		});
		expect(run.requests[0].body).toBeUndefined();
		expect(run.output[0]).toMatchObject({ status: 'FAILED', timedOut: false });
	});

	it('Update sends only the fields chosen', async () => {
		const run = await runNode({
			parameters: {
				resource: 'segment',
				operation: 'update',
				segmentId: SEGMENT_ID,
				updateFields: { name: 'US mid-market' },
				...waitBriefly,
			},
			respond: segmentApi(200),
		});

		expect(run.violations).toEqual([]);
		expect(run.requests[0]).toMatchObject({ method: 'PATCH', body: { name: 'US mid-market' } });
	});

	it('Update with new criteria waits for the recalculation', async () => {
		const run = await runNode({
			parameters: {
				resource: 'segment',
				operation: 'update',
				segmentId: SEGMENT_ID,
				updateFields: { criteria: JSON.stringify(CRITERIA) },
				...waitBriefly,
			},
			respond: segmentApi(202),
		});

		// The API answers a criteria change with 202, but the published document only lists 200.
		expect(run.violations).toEqual([
			`PATCH /dataset/segments/${SEGMENT_ID}: test responds 202, which the spec does not document`,
		]);
		expect(run.output[0]).toMatchObject({ status: 'READY' });
	});

	it('Update with nothing chosen fails before calling Goodfit', async () => {
		const run = await runNode({
			parameters: {
				resource: 'segment',
				operation: 'update',
				segmentId: SEGMENT_ID,
				updateFields: {},
				...waitBriefly,
			},
			respond: segmentApi(200),
		});

		expect(run.requests).toEqual([]);
		expect((run.error as Error).message).toBe('Choose at least one field to update');
	});

	it('Get returns the segment with its criteria', async () => {
		const run = await runNode({
			parameters: { resource: 'segment', operation: 'get', segmentId: SEGMENT_ID },
			respond: () => ({ statusCode: 200, body: { segment: segment('READY') } }),
		});

		expect(run.violations).toEqual([]);
		expect(run.output).toEqual([segment('READY')]);
	});

	it('Get Many pages through the segment list', async () => {
		const run = await runNode({
			parameters: { resource: 'segment', operation: 'getAll', returnAll: true },
			respond: ({ query }) => ({
				statusCode: 200,
				body: {
					segments: [listItem('READY')],
					totalSegments: 2,
					hasMoreResults: !query.iterator,
					nextIterator: query.iterator ? null : 'page-2',
				},
			}),
		});

		expect(run.violations).toEqual([]);
		expect(run.requests).toHaveLength(2);
		expect(run.output).toHaveLength(2);
	});

	it('Delete returns the deleted segment’s id', async () => {
		const run = await runNode({
			parameters: { resource: 'segment', operation: 'delete', segmentId: SEGMENT_ID },
			respond: () => ({ statusCode: 204 }),
		});

		expect(run.violations).toEqual([]);
		expect(run.output).toEqual([{ id: SEGMENT_ID, deleted: true }]);
	});

	it('Preview counts the companies and returns a sample without saving', async () => {
		const run = await runNode({
			parameters: {
				resource: 'segment',
				operation: 'preview',
				criteriaMode: 'json',
				criteria: JSON.stringify(CRITERIA),
				sample: 2,
				additionalFields: { maxCompanies: 100 },
			},
			respond: () => ({
				statusCode: 200,
				body: {
					sizeCompanies: 100,
					companies: [{ domain: 'goodfit.io' }, { domain: 'example.com' }],
				},
			}),
		});

		expect(run.violations).toEqual([]);
		expect(run.requests[0].body).toEqual({
			filters: CRITERIA,
			sample: 2,
			companyLimit: { max: 100 },
		});
		expect(run.output).toEqual([
			{ sizeCompanies: 100, companies: [{ domain: 'goodfit.io' }, { domain: 'example.com' }] },
		]);
	});

	it('surfaces a name clash as the API’s conflict error', async () => {
		const run = await runNode({
			parameters: {
				resource: 'segment',
				operation: 'create',
				criteriaMode: 'json',
				name: 'US companies',
				criteria: JSON.stringify(CRITERIA),
				additionalFields: {},
				...waitBriefly,
			},
			respond: () => ({
				statusCode: 409,
				body: { error: 'Conflict: A live segment already has this name', code: 'CONFLICT' },
			}),
		});

		expect(run.violations).toEqual([]);
		expect((run.error as Error).message).toBe('Conflict: A live segment already has this name');
	});
});
