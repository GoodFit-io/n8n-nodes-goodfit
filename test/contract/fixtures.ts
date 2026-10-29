export function company(domain: string) {
	return {
		__company_id: `company-${domain}`,
		__added_at: '2026-09-01T00:00:00.000Z',
		__updated_at: '2026-09-20T00:00:00.000Z',
		domain,
	};
}

export function contact(id: string, companyId: string) {
	return { __id: id, __company_id: companyId, first_name: 'Jane' };
}

export function companyPage(domains: string[], nextIterator: string | null) {
	return {
		companies: domains.map(company),
		totalCompanies: 10,
		hasMoreResults: nextIterator !== null,
		nextIterator,
	};
}

export const credits = {
	credits: { contact: 120, phoneNumber: null },
	limits: { companies: { limit: 5000, usage: 3200 }, contacts: { limit: null, usage: 810 } },
};

export const notFound = { error: 'Not found: Company not found', code: 'NOT_FOUND' };
