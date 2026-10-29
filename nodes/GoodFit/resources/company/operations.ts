import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { compact, externalIdsFrom } from '../../shared/compact';
import {
	DATASET_MIN_INTERVAL_MS,
	listDataset,
	listFields,
	maxResultsFor,
	sinceQuery,
} from '../../shared/dataset';
import { runAsyncBatch } from '../../shared/asyncBatch';
import { asyncBatchOptions, type ResourceOperations } from '../../shared/operation';
import { criteriaFromParameters } from '../../shared/criteria';
import { pacer } from '../../shared/pacing';
import { collectPages } from '../../shared/pagination';
import { goodFitFind, goodFitRequest } from '../../shared/transport';

type EnrichmentStatus = IDataObject & { status: string; inputs?: { domain?: string } };

const QUEUED = 'Queued';
const COMPLETED = 'Completed';

export const NO_DOMAIN_OUTPUT = {
	requestId: null,
	status: 'Skipped',
	context: {
		skipReason: 'NO_DOMAIN',
		skipReasonDescription: 'The item has no domain or email to enrich',
	},
	timedOut: false,
};

async function enrich(this: IExecuteFunctions) {
	const paceDatasetCall = pacer(DATASET_MIN_INTERVAL_MS);
	return runAsyncBatch<EnrichmentStatus>(
		this.getInputData().length,
		{
			skippedOutput: (itemIndex) =>
				hasNothingToEnrich.call(this, itemIndex) ? NO_DOMAIN_OUTPUT : undefined,
			requestBody: (itemIndex) => enrichBody.call(this, itemIndex),
			submit: (itemIndex, body) =>
				goodFitRequest.call(this, { method: 'POST', path: '/enrichment/enrich', body, itemIndex }),
			fetchStatus: (requestId) => fetchEnrichmentStatus.call(this, requestId),
			isSettled: (status) => status.status !== QUEUED,
			toOutput: async (itemIndex, status) => {
				if (!wantsCompanyData.call(this, itemIndex, status)) return status;
				await paceDatasetCall();
				return {
					...status,
					company: await findCompany.call(this, status.inputs?.domain, itemIndex),
				};
			},
		},
		asyncBatchOptions.call(this),
	);
}

function wantsCompanyData(this: IExecuteFunctions, itemIndex: number, status: EnrichmentStatus) {
	const includeCompanyData = this.getNodeParameter(
		'includeCompanyData',
		itemIndex,
		false,
	) as boolean;
	return includeCompanyData && status.status === COMPLETED;
}

function hasNothingToEnrich(this: IExecuteFunctions, itemIndex: number): boolean {
	if (!(this.getNodeParameter('skipEmptyDomain', itemIndex, false) as boolean)) return false;
	const identifyBy = this.getNodeParameter('identifyBy', itemIndex) as 'domain' | 'email';
	return !String(this.getNodeParameter(identifyBy, itemIndex, '') ?? '').trim();
}

function enrichBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const identifyBy = this.getNodeParameter('identifyBy', itemIndex) as 'domain' | 'email';
	const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;

	return compact({
		[identifyBy]: this.getNodeParameter(identifyBy, itemIndex) as string,
		externalIds: externalIdsFrom(additional),
		forceOverrideExternalIds: additional.forceOverrideExternalIds,
	});
}

async function findCompany(this: IExecuteFunctions, domain: string | undefined, itemIndex: number) {
	if (!domain) return null;
	const response = await goodFitFind.call(this, companyByDomain(domain, itemIndex));
	return (response?.company as IDataObject | undefined) ?? null;
}

async function getCompanyByDomain(this: IExecuteFunctions, domain: string, itemIndex: number) {
	const response = await goodFitRequest.call(this, companyByDomain(domain, itemIndex));
	return response.company as IDataObject;
}

function companyByDomain(domain: string, itemIndex: number) {
	return {
		method: 'GET' as const,
		path: `/dataset/companies/${encodeURIComponent(domain)}`,
		itemIndex,
	};
}

function fetchEnrichmentStatus(this: IExecuteFunctions, requestId: string, itemIndex?: number) {
	return goodFitRequest.call(this, {
		method: 'GET',
		path: `/enrichment/request/${encodeURIComponent(requestId)}`,
		itemIndex,
	}) as Promise<EnrichmentStatus>;
}

async function searchCompanies(this: IExecuteFunctions, itemIndex: number) {
	const filters = await criteriaFromParameters.call(this, itemIndex, 'filters');
	return collectPages(
		(limit, iterator) =>
			goodFitRequest.call(this, {
				method: 'POST',
				path: '/dataset/companies/search',
				body: compact({ filters, limit, iterator }),
				itemIndex,
			}),
		'companies',
		maxResultsFor.call(this, itemIndex),
	);
}

export const companyOperations: ResourceOperations = {
	enrich: { batch: enrich },
	get: {
		perItem(itemIndex) {
			return getCompanyByDomain.call(
				this,
				this.getNodeParameter('domain', itemIndex) as string,
				itemIndex,
			);
		},
	},
	getEnrichmentStatus: {
		perItem(itemIndex) {
			return fetchEnrichmentStatus.call(
				this,
				this.getNodeParameter('requestId', itemIndex) as string,
				itemIndex,
			);
		},
	},
	getAll: {
		perItem(itemIndex) {
			const filters = this.getNodeParameter('listFilters', itemIndex, {}) as IDataObject;
			return listDataset.call(
				this,
				itemIndex,
				'/dataset/companies',
				'companies',
				sinceQuery(filters),
			);
		},
	},
	search: { perItem: searchCompanies },
	getFields: {
		perItem(itemIndex) {
			return listFields.call(this, itemIndex, '/dataset/companies/fields');
		},
	},
};
