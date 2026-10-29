import type { IDataObject } from 'n8n-workflow';

export const MAX_PAGE_SIZE = 1000;

export interface Page {
	hasMoreResults?: boolean;
	nextIterator?: string | null;
	[itemsKey: string]: unknown;
}

export type FetchPage = (limit: number, iterator?: string) => Promise<Page>;

export async function collectPages(
	fetchPage: FetchPage,
	itemsKey: string,
	maxResults?: number,
): Promise<IDataObject[]> {
	const results: IDataObject[] = [];
	let iterator: string | undefined;

	do {
		const page = await fetchPage(nextPageSize(results.length, maxResults), iterator);
		results.push(...((page[itemsKey] as IDataObject[] | undefined) ?? []));
		iterator = page.hasMoreResults ? (page.nextIterator ?? undefined) : undefined;
	} while (iterator !== undefined && !reachedLimit(results.length, maxResults));

	return maxResults === undefined ? results : results.slice(0, maxResults);
}

function nextPageSize(collected: number, maxResults?: number): number {
	return maxResults === undefined ? MAX_PAGE_SIZE : Math.min(MAX_PAGE_SIZE, maxResults - collected);
}

function reachedLimit(collected: number, maxResults?: number): boolean {
	return maxResults !== undefined && collected >= maxResults;
}
