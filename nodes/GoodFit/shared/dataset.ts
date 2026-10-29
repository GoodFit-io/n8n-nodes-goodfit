import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { compact } from './compact';
import { collectPages } from './pagination';
import { goodFitRequest } from './transport';

export const DATASET_MIN_INTERVAL_MS = 500;

export async function listDataset(
	this: IExecuteFunctions,
	itemIndex: number,
	path: string,
	itemsKey: string,
	query: IDataObject,
): Promise<IDataObject[]> {
	return collectPages(
		(limit, iterator) =>
			goodFitRequest.call(this, {
				method: 'GET',
				path,
				qs: { ...query, limit, iterator },
				itemIndex,
			}),
		itemsKey,
		maxResultsFor.call(this, itemIndex),
	);
}

export function maxResultsFor(this: IExecuteFunctions, itemIndex: number): number | undefined {
	const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
	return returnAll ? undefined : (this.getNodeParameter('limit', itemIndex) as number);
}

export function sinceQuery(filters: IDataObject): IDataObject {
	return compact({ updated_since: filters.updatedSince, added_since: filters.addedSince });
}

export async function listFields(
	this: IExecuteFunctions,
	itemIndex: number,
	path: string,
): Promise<IDataObject[]> {
	const response = await goodFitRequest.call(this, { method: 'GET', path, itemIndex });
	return (response.fields as IDataObject[] | undefined) ?? [];
}
