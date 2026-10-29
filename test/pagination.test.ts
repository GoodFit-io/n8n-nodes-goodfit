import { describe, expect, it, vi } from 'vitest';
import { collectPages, MAX_PAGE_SIZE, type FetchPage } from '../nodes/GoodFit/shared/pagination';

function pagesOf(...pages: Array<Array<{ id: number }>>): FetchPage {
	let index = 0;
	return vi.fn(async () => {
		const companies = pages[index];
		index++;
		const hasMoreResults = index < pages.length;
		return { companies, hasMoreResults, nextIterator: hasMoreResults ? `cursor-${index}` : null };
	});
}

describe('collectPages', () => {
	it('follows the iterator until there are no more results', async () => {
		const fetchPage = pagesOf([{ id: 1 }], [{ id: 2 }], [{ id: 3 }]);

		const results = await collectPages(fetchPage, 'companies');

		expect(results.map((row) => row.id)).toEqual([1, 2, 3]);
		expect(fetchPage).toHaveBeenNthCalledWith(1, MAX_PAGE_SIZE, undefined);
		expect(fetchPage).toHaveBeenNthCalledWith(2, MAX_PAGE_SIZE, 'cursor-1');
	});

	it('asks only for what is left of the limit and stops once it is reached', async () => {
		const fetchPage = pagesOf([{ id: 1 }, { id: 2 }], [{ id: 3 }, { id: 4 }], [{ id: 5 }]);

		const results = await collectPages(fetchPage, 'companies', 3);

		expect(results.map((row) => row.id)).toEqual([1, 2, 3]);
		expect(fetchPage).toHaveBeenNthCalledWith(1, 3, undefined);
		expect(fetchPage).toHaveBeenNthCalledWith(2, 1, 'cursor-1');
		expect(fetchPage).toHaveBeenCalledTimes(2);
	});

	it('treats a page without the items key as empty', async () => {
		const results = await collectPages(async () => ({ hasMoreResults: false }), 'contacts');

		expect(results).toEqual([]);
	});
});
