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

function enrichBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	const identity = compact({
		linkedInUrl: this.getNodeParameter('linkedInUrl', itemIndex) as string,
		workEmail: this.getNodeParameter('workEmail', itemIndex) as string,
		firstName: additional.firstName,
		lastName: additional.lastName,
		jobTitle: additional.jobTitle,
		companyName: additional.companyName,
		companyDomain: additional.companyDomain,
		selectedCompanyId: additional.selectedCompanyId,
		selectedCandidateId: additional.selectedCandidateId,
	});
	if (!canIdentify(identity)) {
		throw new NodeOperationError(
			this.getNode(),
			'Provide a LinkedIn URL, a work email, or a first name, last name and company',
			{ itemIndex },
		);
	}
	return compact({
		identity,
		externalIds: externalIdsFrom(additional),
		enrichPhoneNumber: this.getNodeParameter('enrichPhoneNumber', itemIndex) as boolean,
		syncToCRM: this.getNodeParameter('syncToCrm', itemIndex) as boolean,
	});
}

function canIdentify(identity: IDataObject): boolean {
	const named =
		identity.firstName && identity.lastName && (identity.companyDomain || identity.companyName);
	return Boolean(identity.linkedInUrl || identity.workEmail || named);
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
