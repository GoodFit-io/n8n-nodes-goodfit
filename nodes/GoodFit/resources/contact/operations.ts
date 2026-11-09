import { NodeOperationError, type IDataObject, type IExecuteFunctions } from 'n8n-workflow';
import { compact, externalIdsFrom } from '../../shared/compact';
import { listDataset, listFields, sinceQuery } from '../../shared/dataset';
import { runAsyncBatch, type AsyncBatchSpec } from '../../shared/asyncBatch';
import { asyncBatchOptions, type ResourceOperations } from '../../shared/operation';
import { goodFitRequest } from '../../shared/transport';

type EnrichmentStatus = IDataObject & { status: string };

const IN_FLIGHT = new Set(['QUEUED', 'IN_PROGRESS']);

async function enrich(this: IExecuteFunctions) {
	return runContactBatch.call(
		this,
		(itemIndex) => enrichBody.call(this, itemIndex),
		(itemIndex, body) =>
			goodFitRequest.call(this, {
				method: 'POST',
				path: '/enrichment/enrich-contact/request',
				body,
				itemIndex,
			}),
	);
}

async function resolve(this: IExecuteFunctions) {
	return runContactBatch.call(
		this,
		(itemIndex) => resolveBody.call(this, itemIndex),
		(itemIndex, body) =>
			goodFitRequest.call(this, {
				method: 'POST',
				path: `${requestPath(this.getNodeParameter('requestId', itemIndex) as string)}/resolve`,
				body,
				itemIndex,
			}),
	);
}

function runContactBatch(
	this: IExecuteFunctions,
	requestBody: AsyncBatchSpec<EnrichmentStatus>['requestBody'],
	submit: AsyncBatchSpec<EnrichmentStatus>['submit'],
) {
	return runAsyncBatch<EnrichmentStatus>(
		this.getInputData().length,
		{
			requestBody,
			submit,
			fetchStatus: (requestId) => fetchEnrichmentStatus.call(this, requestId),
			isSettled: (status) => !IN_FLIGHT.has(status.status),
			toOutput: async (_itemIndex, status) => status,
		},
		asyncBatchOptions.call(this),
	);
}

const RESOLVE_CHOICES = {
	person: {
		parameter: 'candidateId',
		bodyKey: 'selectedCandidateId',
		missing: 'Enter the candidateId of the person you mean',
	},
	employment: {
		parameter: 'companyId',
		bodyKey: 'selectedCompanyId',
		missing: 'Enter the companyId of the employment to use',
	},
};

function resolveBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const choice =
		RESOLVE_CHOICES[this.getNodeParameter('resolveBy', itemIndex) as keyof typeof RESOLVE_CHOICES];
	requiredText.call(
		this,
		itemIndex,
		'requestId',
		'Enter the Request ID of the enrichment to resolve',
	);
	return { [choice.bodyKey]: requiredText.call(this, itemIndex, choice.parameter, choice.missing) };
}

function requiredText(
	this: IExecuteFunctions,
	itemIndex: number,
	parameter: string,
	missing: string,
): string {
	const text = String(this.getNodeParameter(parameter, itemIndex) ?? '').trim();
	if (!text) throw new NodeOperationError(this.getNode(), missing, { itemIndex });
	return text;
}

type ContactIdentifyBy =
	'linkedInUrl' | 'workEmail' | 'nameAndCompanyDomain' | 'nameAndCompanyName';

const IDENTIFIER_LABELS: Record<string, string> = {
	linkedInUrl: 'LinkedIn URL',
	workEmail: 'Work Email',
	firstName: 'First Name',
	lastName: 'Last Name',
	companyDomain: 'Company Domain',
	companyName: 'Company Name',
};

const IDENTIFIERS: Record<ContactIdentifyBy, string[]> = {
	linkedInUrl: ['linkedInUrl'],
	workEmail: ['workEmail'],
	nameAndCompanyDomain: ['firstName', 'lastName', 'companyDomain'],
	nameAndCompanyName: ['firstName', 'lastName', 'companyName'],
};

function chosenIdentifiers(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const identifyBy = this.getNodeParameter('identifyBy', itemIndex) as ContactIdentifyBy;
	return Object.fromEntries(
		IDENTIFIERS[identifyBy].map((parameter) => [
			parameter,
			requiredText.call(
				this,
				itemIndex,
				parameter,
				`Enter the contact’s ${IDENTIFIER_LABELS[parameter]}`,
			),
		]),
	);
}

function enrichBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	const identity = compact({
		jobTitle: additional.jobTitle,
		companyName: additional.companyName,
		companyDomain: additional.companyDomain,
		selectedCompanyId: additional.selectedCompanyId,
		selectedCandidateId: additional.selectedCandidateId,
		...chosenIdentifiers.call(this, itemIndex),
	});
	return compact({
		identity,
		externalIds: externalIdsFrom(additional),
		enrichPhoneNumber: additional.enrichPhoneNumber ?? false,
		syncToCRM: additional.syncToCrm ?? false,
	});
}

function fetchEnrichmentStatus(this: IExecuteFunctions, requestId: string, itemIndex?: number) {
	return goodFitRequest.call(this, {
		method: 'GET',
		path: requestPath(requestId),
		itemIndex,
	}) as Promise<EnrichmentStatus>;
}

function requestPath(requestId: string): string {
	return `/enrichment/enrich-contact/request/${encodeURIComponent(requestId.trim())}`;
}

export const contactOperations: ResourceOperations = {
	enrich: { batch: enrich },
	resolveMatch: { batch: resolve },
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
			const query = { ...sinceQuery(filters), ...compact({ company_id: filters.companyId }) };
			return listDataset.call(this, itemIndex, '/dataset/contacts', 'contacts', query);
		},
	},
	getFields: {
		perItem(itemIndex) {
			return listFields.call(this, itemIndex, '/dataset/contacts/fields');
		},
	},
};
