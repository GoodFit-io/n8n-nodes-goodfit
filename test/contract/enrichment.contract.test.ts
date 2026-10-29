import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDataObject } from 'n8n-workflow';
import { company } from './fixtures';
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

const REQUEST_IDS: Record<string, string> = {
	'goodfit.io': '6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f',
	'parked.io': '7a2b3c4d-5e6f-4a7b-9c8d-1e2f3a4b5c6d',
};
const CONTACT_REQUEST_ID = '8b3c4d5e-6f7a-4b8c-8d9e-2f3a4b5c6d7e';

function domainFor(requestId: string): string {
	return Object.keys(REQUEST_IDS).find((domain) => REQUEST_IDS[domain] === requestId) ?? '';
}

function companyEnrichmentApi({ method, path, body }: CapturedRequest) {
	if (method === 'POST' && path === '/enrichment/enrich') {
		return {
			statusCode: 201,
			body: { success: true, requestId: REQUEST_IDS[(body as IDataObject).domain as string] },
		};
	}
	const requestId = path.match(/^\/enrichment\/request\/(.+)$/)?.[1];
	if (requestId) return { statusCode: 200, body: enrichmentStatus(requestId) };

	const domain = path.match(/^\/dataset\/companies\/(.+)$/)?.[1] ?? '';
	return { statusCode: 200, body: { company: company(domain) } };
}

function enrichmentStatus(requestId: string) {
	const domain = domainFor(requestId);
	if (domain === 'parked.io') {
		return {
			requestId,
			inputs: { domain },
			status: 'Skipped',
			context: { skipReason: 'DOMAIN_PARKED', skipReasonDescription: 'The domain is parked' },
			isChargable: false,
		};
	}
	return { requestId, inputs: { domain }, status: 'Completed', context: null, isChargable: true };
}

function contactEnrichmentApi({ method }: CapturedRequest) {
	if (method === 'POST') {
		return { statusCode: 201, body: { requestId: CONTACT_REQUEST_ID, status: 'QUEUED' } };
	}
	return {
		statusCode: 200,
		body: {
			requestId: CONTACT_REQUEST_ID,
			status: 'COMPLETE',
			inputs: { linkedInUrl: 'https://www.linkedin.com/in/example-person' },
			result: {
				found: true,
				firstName: 'Jane',
				workEmail: 'jane@example.com',
				mobilePhone: 'NOT_REQUESTED',
				personas: ['Revenue leader'],
			},
		},
	};
}

const waitBriefly = { waitForCompletion: true, timeoutSeconds: 10, pollIntervalSeconds: 2 };

const enrichCompany = {
	resource: 'company',
	operation: 'enrich',
	identifyBy: 'domain',
	includeCompanyData: true,
	additionalFields: {},
	...waitBriefly,
};

const enrichContact = {
	resource: 'contact',
	operation: 'enrich',
	linkedInUrl: 'https://www.linkedin.com/in/example-person',
	workEmail: '',
	enrichPhoneNumber: false,
	syncToCrm: false,
	additionalFields: {},
	...waitBriefly,
};

describe('Enrichment API contract', () => {
	it('Company → Enrich returns the completed company with its dataset record', async () => {
		const run = await runNode({
			parameters: { ...enrichCompany, domain: 'goodfit.io' },
			respond: companyEnrichmentApi,
		});

		expect(run.violations).toEqual([]);
		expect(run.output).toEqual([
			expect.objectContaining({
				status: 'Completed',
				company: company('goodfit.io'),
				timedOut: false,
			}),
		]);
	});

	it('Company → Enrich passes a skipped domain through with its reason and no dataset call', async () => {
		const run = await runNode({
			parameters: { ...enrichCompany, domain: 'parked.io' },
			respond: companyEnrichmentApi,
		});

		expect(run.violations).toEqual([]);
		expect(run.output[0]).toMatchObject({
			status: 'Skipped',
			context: { skipReason: 'DOMAIN_PARKED' },
		});
		expect(run.requests.some((request) => request.path.startsWith('/dataset'))).toBe(false);
	});

	it('Company → Enrich sends CRM record IDs in the documented shape', async () => {
		const run = await runNode({
			parameters: {
				...enrichCompany,
				domain: 'goodfit.io',
				additionalFields: { salesforceId: '001XX000003DHP0', forceOverrideExternalIds: true },
			},
			respond: companyEnrichmentApi,
		});

		expect(run.violations).toEqual([]);
		expect(run.requests[0].body).toEqual({
			domain: 'goodfit.io',
			externalIds: { salesforce: '001XX000003DHP0' },
			forceOverrideExternalIds: true,
		});
	});
});

describe('Contacts API contract', () => {
	it('Contact → Enrich returns the completed result', async () => {
		const run = await runNode({ parameters: enrichContact, respond: contactEnrichmentApi });

		expect(run.violations).toEqual([]);
		expect(run.output[0]).toMatchObject({
			status: 'COMPLETE',
			result: { found: true, workEmail: 'jane@example.com' },
			timedOut: false,
		});
	});

	it('Contact → Enrich reports running out of credits against the item', async () => {
		const run = await runNode({
			parameters: { ...enrichContact, enrichPhoneNumber: true },
			continueOnFail: true,
			respond: () => ({
				statusCode: 402,
				body: {
					error:
						'Payment required: Client is out of PHONE_NUMBER credits, enrichment cannot be started',
					code: 'INSUFFICIENT_CREDITS',
				},
			}),
		});

		expect(run.violations).toEqual([]);
		expect(run.requests[0].body).toMatchObject({ enrichPhoneNumber: true });
		expect(run.output).toEqual([
			{
				error:
					'Payment required: Client is out of PHONE_NUMBER credits, enrichment cannot be started',
			},
		]);
	});
});

function registrableDomain(input: string): string {
	return input
		.replace(/^https?:\/\//, '')
		.replace(/^www\./, '')
		.split('/')[0];
}

function enrichmentApiFor(statusOf: (requestId: string) => string) {
	return ({ method, path, body }: CapturedRequest) => {
		if (method === 'POST') {
			const { domain, email } = body as { domain?: string; email?: string };
			const key = registrableDomain(domain ?? String(email).split('@')[1]);
			return { statusCode: 201, body: { success: true, requestId: REQUEST_IDS[key] } };
		}
		const requestId = path.split('/').pop()!;
		if (path.startsWith('/enrichment/request/')) {
			const domain = domainFor(requestId);
			return {
				statusCode: 200,
				body: { requestId, inputs: { domain }, status: statusOf(requestId), context: null },
			};
		}
		return { statusCode: 200, body: { company: company(path.split('/').pop()!) } };
	};
}

describe('Enrich across many items', () => {
	it('enriches by email and by domain in one run, pairing each output with its input', async () => {
		const items = [{ email: 'hello@goodfit.io' }, { domain: 'parked.io' }];
		const run = await runNode({
			items,
			parameters: {
				...enrichCompany,
				includeCompanyData: false,
				identifyBy: (index: number) => (items[index].email ? 'email' : 'domain'),
				email: (index: number) => items[index].email,
				domain: (index: number) => items[index].domain,
			},
			respond: enrichmentApiFor(() => 'Completed'),
		});

		expect(run.violations).toEqual([]);
		expect(run.requests.filter((request) => request.method === 'POST').map((r) => r.body)).toEqual([
			{ email: 'hello@goodfit.io' },
			{ domain: 'parked.io' },
		]);
		expect(run.items.map((item) => item.pairedItem)).toEqual([{ item: 0 }, { item: 1 }]);
	});

	it('returns items still queued at the timeout with timedOut and their request id', async () => {
		const run = await runNode({
			parameters: { ...enrichCompany, domain: 'goodfit.io' },
			respond: enrichmentApiFor(() => 'Queued'),
		});

		expect(run.violations).toEqual([]);
		expect(run.output).toEqual([
			expect.objectContaining({
				requestId: REQUEST_IDS['goodfit.io'],
				status: 'Queued',
				timedOut: true,
			}),
		]);
	});

	it('without Continue On Fail, rejects the run before submitting anything when one contact is invalid', async () => {
		const items = [
			{ url: 'https://www.linkedin.com/in/a' },
			{ url: '' },
			{ url: 'https://www.linkedin.com/in/c' },
		];
		const run = await runNode({
			items,
			parameters: { ...enrichContact, linkedInUrl: (index: number) => items[index].url },
			respond: contactEnrichmentApi,
		});

		expect(run.requests).toEqual([]);
		expect((run.error as Error).message).toBe(
			'Provide a LinkedIn URL, a work email, or a first name, last name and company',
		);
		expect((run.error as { context: { itemIndex: number } }).context.itemIndex).toBe(1);
	});

	it('gives two items for the same contact the one in-flight request’s result', async () => {
		let submitted = 0;
		const run = await runNode({
			items: [{}, {}],
			parameters: enrichContact,
			respond: (request) => {
				if (request.method !== 'POST') return contactEnrichmentApi(request);
				submitted++;
				return {
					statusCode: submitted === 1 ? 201 : 200,
					body: {
						requestId: CONTACT_REQUEST_ID,
						status: submitted === 1 ? 'QUEUED' : 'IN_PROGRESS',
					},
				};
			},
		});

		// The API answers an in-flight duplicate with 200, but the published document only lists 201.
		expect(run.violations).toEqual([
			'POST /enrichment/enrich-contact/request: test responds 200, which the spec does not document',
		]);
		expect(run.requests.filter((request) => request.method === 'GET')).toHaveLength(1);
		expect(run.output.map((json) => json.status)).toEqual(['COMPLETE', 'COMPLETE']);
		expect(run.items.map((item) => item.pairedItem)).toEqual([{ item: 0 }, { item: 1 }]);
	});

	it('fetches company data by the domain Goodfit derived from each email, spaced for the Dataset API limit', async () => {
		const emails = ['hello@goodfit.io', 'sam@parked.io'];
		const datasetCalls: Array<{ path: string; at: number }> = [];
		const api = enrichmentApiFor(() => 'Completed');
		const run = await runNode({
			items: emails.map((email) => ({ email })),
			parameters: {
				...enrichCompany,
				identifyBy: 'email',
				email: (index: number) => emails[index],
			},
			respond: (request) => {
				if (request.path.startsWith('/dataset'))
					datasetCalls.push({ path: request.path, at: Date.now() });
				return api(request);
			},
		});

		expect(run.violations).toEqual([]);
		expect(datasetCalls.map((call) => call.path)).toEqual([
			'/dataset/companies/goodfit.io',
			'/dataset/companies/parked.io',
		]);
		expect(datasetCalls[1].at - datasetCalls[0].at).toBeGreaterThanOrEqual(500);
		expect(run.output.map((json) => (json.company as { domain: string }).domain)).toEqual([
			'goodfit.io',
			'parked.io',
		]);
	});
});

describe('Enrich options for CRM write-back flows', () => {
	it('skips items without a domain instead of calling Goodfit or failing', async () => {
		const accounts = [
			{ Id: '001A', Website: 'https://www.goodfit.io/about' },
			{ Id: '001B', Website: '' },
		];
		const run = await runNode({
			items: accounts,
			parameters: {
				...enrichCompany,
				skipEmptyDomain: true,
				includeInputFields: true,
				domain: (index: number) => accounts[index].Website,
			},
			respond: enrichmentApiFor(() => 'Completed'),
		});

		expect(run.violations).toEqual([]);
		expect(run.error).toBeUndefined();
		expect(run.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
		expect(run.output[1]).toMatchObject({
			Id: '001B',
			status: 'Skipped',
			requestId: null,
			context: { skipReason: 'NO_DOMAIN' },
		});
	});

	it('fails an item without a domain when skipping is off', async () => {
		const run = await runNode({
			parameters: { ...enrichCompany, skipEmptyDomain: false, domain: '' },
			respond: () => ({
				statusCode: 400,
				body: {
					error: 'Bad request: Either domain or email must be provided',
					code: 'INVALID_REQUEST',
				},
			}),
		});

		expect(run.violations).toEqual([]);
		expect((run.error as Error).message).toBe(
			'Bad request: Either domain or email must be provided',
		);
	});

	it('keeps each input item’s fields in its output, with Goodfit’s fields winning on a clash', async () => {
		const accounts = [
			{ Id: '001A', Website: 'goodfit.io', status: 'stale' },
			{ Id: '001B', Website: 'parked.io' },
		];
		const run = await runNode({
			items: accounts,
			parameters: {
				...enrichCompany,
				includeCompanyData: false,
				includeInputFields: true,
				domain: (index: number) => accounts[index].Website,
			},
			respond: enrichmentApiFor(() => 'Completed'),
		});

		expect(run.violations).toEqual([]);
		expect(run.output.map((json) => [json.Id, json.status])).toEqual([
			['001A', 'Completed'],
			['001B', 'Completed'],
		]);
	});

	it('keeps input fields on items that failed, so the error can be written back to the record', async () => {
		const run = await runNode({
			items: [{ Id: '001A' }],
			continueOnFail: true,
			parameters: {
				...enrichCompany,
				skipEmptyDomain: false,
				includeInputFields: true,
				domain: 'gmail.com',
			},
			respond: () => ({
				statusCode: 400,
				body: {
					error: 'Bad request: Domain is invalid or from a personal email provider',
					code: 'INVALID_REQUEST',
				},
			}),
		});

		expect(run.violations).toEqual([]);
		expect(run.output).toEqual([
			{ Id: '001A', error: 'Bad request: Domain is invalid or from a personal email provider' },
		]);
	});

	it('leaves the output alone when input fields are not included', async () => {
		const run = await runNode({
			items: [{ Id: '001A' }],
			parameters: { ...enrichCompany, includeCompanyData: false, domain: 'goodfit.io' },
			respond: enrichmentApiFor(() => 'Completed'),
		});

		expect(run.output[0]).not.toHaveProperty('Id');
	});
});

describe('Resolving a contact with several employments', () => {
	const employments = [
		{
			companyId: 'c-1',
			companyName: 'Goodfit',
			companyDomain: 'goodfit.io',
			jobTitle: 'CTO',
			startDate: '2024-01-01',
		},
		{
			companyId: 'c-2',
			companyName: 'Side Co',
			companyDomain: null,
			jobTitle: 'Advisor',
			startDate: null,
		},
	];

	function contactApiAnswering(result: IDataObject) {
		return ({ method }: CapturedRequest) =>
			method === 'POST'
				? { statusCode: 201, body: { requestId: CONTACT_REQUEST_ID, status: 'QUEUED' } }
				: {
						statusCode: 200,
						body: { requestId: CONTACT_REQUEST_ID, status: 'COMPLETE', inputs: {}, result },
					};
	}

	it('returns the employments to choose from', async () => {
		const run = await runNode({
			parameters: enrichContact,
			respond: contactApiAnswering({
				found: false,
				reason: 'MULTIPLE_EMPLOYMENTS_FOUND',
				employments,
				personas: [],
			}),
		});

		expect(run.violations).toEqual([]);
		expect(run.output[0]).toMatchObject({
			result: { reason: 'MULTIPLE_EMPLOYMENTS_FOUND', employments },
		});
	});

	it('resubmits with the chosen employment as the selected company', async () => {
		const run = await runNode({
			parameters: { ...enrichContact, additionalFields: { selectedCompanyId: 'c-1' } },
			respond: contactApiAnswering({ found: true, workEmail: 'jane@example.com', personas: [] }),
		});

		expect(run.violations).toEqual([]);
		expect(run.requests[0].body).toMatchObject({
			identity: { linkedInUrl: 'https://www.linkedin.com/in/example-person', selectedCompanyId: 'c-1' },
		});
		expect(run.output[0]).toMatchObject({ result: { found: true } });
	});

	it('identifies a contact by name and company without a LinkedIn URL or email', async () => {
		const run = await runNode({
			parameters: {
				...enrichContact,
				linkedInUrl: '',
				workEmail: '',
				additionalFields: {
					firstName: 'Jane',
					lastName: 'Doe',
					companyDomain: 'goodfit.io',
					jobTitle: 'Head of RevOps',
				},
			},
			respond: contactEnrichmentApi,
		});

		expect(run.violations).toEqual([]);
		expect(run.requests[0].body).toMatchObject({
			identity: {
				firstName: 'Jane',
				lastName: 'Doe',
				companyDomain: 'goodfit.io',
				jobTitle: 'Head of RevOps',
			},
		});
	});

	it('rejects a name without a company before calling Goodfit', async () => {
		const run = await runNode({
			parameters: {
				...enrichContact,
				linkedInUrl: '',
				workEmail: '',
				additionalFields: { firstName: 'Jane', lastName: 'Doe' },
			},
			respond: contactEnrichmentApi,
		});

		expect(run.requests).toEqual([]);
		expect((run.error as Error).message).toBe(
			'Provide a LinkedIn URL, a work email, or a first name, last name and company',
		);
	});
});

describe('Contact → Resolve Match', () => {
	const RESOLVED_REQUEST_ID = '9c4d5e6f-7a8b-4c9d-9e0f-3a4b5c6d7e8f';
	const resolveMatch = {
		resource: 'contact',
		operation: 'resolveMatch',
		requestId: CONTACT_REQUEST_ID,
		resolveBy: 'person',
		candidateId: 'cand-2',
		companyId: '',
		...waitBriefly,
	};

	function resolvingApi({ method, path }: CapturedRequest) {
		if (method === 'POST') {
			return { statusCode: 201, body: { requestId: RESOLVED_REQUEST_ID, status: 'QUEUED' } };
		}
		return {
			statusCode: 200,
			body: {
				requestId: path.split('/').pop(),
				status: 'COMPLETE',
				inputs: {},
				result: { found: true, workEmail: 'jane@example.com', personas: [] },
			},
		};
	}

	it('sends the picked person to the original request and returns the new enrichment', async () => {
		const run = await runNode({ parameters: resolveMatch, respond: resolvingApi });

		expect(run.violations).toEqual([]);
		expect(run.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
			`POST /enrichment/enrich-contact/request/${CONTACT_REQUEST_ID}/resolve`,
			`GET /enrichment/enrich-contact/request/${RESOLVED_REQUEST_ID}`,
		]);
		expect(run.requests[0].body).toEqual({ selectedCandidateId: 'cand-2' });
		expect(run.output[0]).toMatchObject({
			requestId: RESOLVED_REQUEST_ID,
			result: { found: true, workEmail: 'jane@example.com' },
			timedOut: false,
		});
	});

	it('sends the picked employment as the selected company', async () => {
		const run = await runNode({
			parameters: { ...resolveMatch, resolveBy: 'employment', candidateId: '', companyId: 'c-1' },
			respond: resolvingApi,
		});

		expect(run.violations).toEqual([]);
		expect(run.requests[0].body).toEqual({ selectedCompanyId: 'c-1' });
	});

	it('rejects a missing choice before calling Goodfit', async () => {
		const run = await runNode({
			parameters: { ...resolveMatch, candidateId: ' ' },
			respond: resolvingApi,
		});

		expect(run.requests).toEqual([]);
		expect((run.error as Error).message).toBe('Enter the candidateId of the person you mean');
	});

	it('rejects a missing Request ID before calling Goodfit', async () => {
		const run = await runNode({
			parameters: { ...resolveMatch, requestId: '  ' },
			respond: resolvingApi,
		});

		expect(run.requests).toEqual([]);
		expect((run.error as Error).message).toBe('Enter the Request ID of the enrichment to resolve');
	});

	it('trims a pasted Request ID before using it in the path', async () => {
		const run = await runNode({
			parameters: { ...resolveMatch, requestId: `${CONTACT_REQUEST_ID}\n` },
			respond: resolvingApi,
		});

		expect(run.violations).toEqual([]);
		expect(run.requests[0].path).toBe(
			`/enrichment/enrich-contact/request/${CONTACT_REQUEST_ID}/resolve`,
		);
	});

	it('returns the new request straight away when not waiting', async () => {
		const run = await runNode({
			parameters: { ...resolveMatch, waitForCompletion: false },
			respond: resolvingApi,
		});

		expect(run.violations).toEqual([]);
		expect(run.requests).toHaveLength(1);
		expect(run.output).toEqual([{ requestId: RESOLVED_REQUEST_ID, status: 'QUEUED' }]);
	});

	it('keeps the input item’s fields when Include Input Fields is on', async () => {
		const run = await runNode({
			parameters: { ...resolveMatch, includeInputFields: true },
			items: [{ crmId: 'lead-7' }],
			respond: resolvingApi,
		});

		expect(run.output[0]).toMatchObject({ crmId: 'lead-7', requestId: RESOLVED_REQUEST_ID });
	});

	it('reports a request that has no choice to make against the item', async () => {
		const run = await runNode({
			parameters: resolveMatch,
			continueOnFail: true,
			respond: () => ({
				statusCode: 409,
				body: { error: 'The request did not end with a choice to make', code: 'CONFLICT' },
			}),
		});

		expect(run.violations).toEqual([]);
		expect(run.output).toEqual([{ error: 'The request did not end with a choice to make' }]);
	});
});
