import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
} from 'n8n-workflow';
import { runAsyncBatch } from '../../shared/asyncBatch';
import { compact } from '../../shared/compact';
import { listDataset } from '../../shared/dataset';
import { criteriaFromParameters } from '../../shared/criteria';
import { domainList, parseJsonParameter } from '../../shared/filters';
import { asyncBatchOptions, type ResourceOperations } from '../../shared/operation';
import { goodFitRequest } from '../../shared/transport';

type Segment = IDataObject & { id: string; status: string };

const SETTLED = new Set(['READY', 'FAILED']);
const SEGMENTS = '/dataset/segments';

function segmentPath(this: IExecuteFunctions, itemIndex: number, suffix = ''): string {
	const segmentId = this.getNodeParameter('segmentId', itemIndex) as string;
	return `${SEGMENTS}/${encodeURIComponent(segmentId)}${suffix}`;
}

async function fetchSegment(this: IExecuteFunctions, segmentId: string, itemIndex?: number) {
	const response = await goodFitRequest.call(this, {
		method: 'GET',
		path: `${SEGMENTS}/${encodeURIComponent(segmentId)}`,
		itemIndex,
	});
	return response.segment as Segment;
}

function changeAndWait(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	path: (itemIndex: number) => string,
	requestBody?: (itemIndex: number) => IDataObject | Promise<IDataObject>,
) {
	return runAsyncBatch<Segment>(
		this.getInputData().length,
		{
			requestBody: (itemIndex) => requestBody?.(itemIndex) ?? {},
			submit: async (itemIndex, body) => {
				const response = await goodFitRequest.call(this, {
					method,
					path: path(itemIndex),
					body: requestBody ? body : undefined,
					itemIndex,
				});
				return response.segment as Segment;
			},
			requestIdOf: (segment) => String(segment.id),
			fetchStatus: (segmentId) => fetchSegment.call(this, segmentId),
			isSettled: (segment) => SETTLED.has(segment.status),
			toOutput: async (_itemIndex, segment) => segment,
		},
		asyncBatchOptions.call(this),
	);
}

function sizeSettings(fields: IDataObject): IDataObject {
	const maxCompanies = Number(fields.maxCompanies ?? 0);
	return compact({
		excludeDomains:
			fields.excludeDomains === undefined ? undefined : domainList(fields.excludeDomains),
		companyLimit:
			maxCompanies > 0
				? compact({
						max: maxCompanies,
						orderBy: fields.orderBy,
						orderDirection: fields.orderDirection,
					})
				: undefined,
	});
}

async function createBody(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	return compact({
		name: this.getNodeParameter('name', itemIndex) as string,
		filters: await criteriaFromParameters.call(this, itemIndex, 'criteria'),
		isDynamic: additional.isDynamic,
		...sizeSettings(additional),
	});
}

function updateBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const fields = this.getNodeParameter('updateFields', itemIndex, {}) as IDataObject;
	const body = compact({
		name: fields.name,
		isDynamic: fields.isDynamic,
		filters:
			fields.criteria === undefined
				? undefined
				: parseJsonParameter(fields.criteria as string | IDataObject),
		...sizeSettings(fields),
	});
	if (Object.keys(body).length === 0) {
		throw new NodeOperationError(this.getNode(), 'Choose at least one field to update', {
			itemIndex,
		});
	}
	return body;
}

async function previewBody(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	return compact({
		filters: await criteriaFromParameters.call(this, itemIndex, 'criteria'),
		sample: this.getNodeParameter('sample', itemIndex, 0) as number,
		...sizeSettings(additional),
	});
}

export const segmentOperations: ResourceOperations = {
	create: {
		batch() {
			return changeAndWait.call(
				this,
				'POST',
				() => SEGMENTS,
				(itemIndex) => createBody.call(this, itemIndex),
			);
		},
	},
	update: {
		batch() {
			return changeAndWait.call(
				this,
				'PATCH',
				(itemIndex) => segmentPath.call(this, itemIndex),
				(itemIndex) => updateBody.call(this, itemIndex),
			);
		},
	},
	refresh: {
		batch() {
			return changeAndWait.call(this, 'POST', (itemIndex) =>
				segmentPath.call(this, itemIndex, '/refresh'),
			);
		},
	},
	get: {
		perItem(itemIndex) {
			return fetchSegment.call(
				this,
				this.getNodeParameter('segmentId', itemIndex) as string,
				itemIndex,
			);
		},
	},
	getAll: {
		perItem(itemIndex) {
			return listDataset.call(this, itemIndex, SEGMENTS, 'segments', {});
		},
	},
	delete: {
		async perItem(itemIndex) {
			await goodFitRequest.call(this, {
				method: 'DELETE',
				path: segmentPath.call(this, itemIndex),
				itemIndex,
			});
			return { id: this.getNodeParameter('segmentId', itemIndex) as string, deleted: true };
		},
	},
	preview: {
		async perItem(itemIndex) {
			return goodFitRequest.call(this, {
				method: 'POST',
				path: `${SEGMENTS}/preview`,
				body: await previewBody.call(this, itemIndex),
				itemIndex,
			});
		},
	},
};
