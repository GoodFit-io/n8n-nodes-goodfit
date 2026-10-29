import { jsonParse, type IDataObject } from 'n8n-workflow';

export const EXAMPLE_FILTERS = JSON.stringify(
	{
		id: 'root',
		combinator: 'and',
		rules: [{ id: 'r1', field: 'country', operator: 'equalTo', value: 'US' }],
	},
	null,
	2,
);

export function parseJsonParameter(value: string | IDataObject): IDataObject {
	return typeof value === 'string' ? jsonParse<IDataObject>(value) : value;
}

export function domainList(value: unknown): string[] {
	const domains = Array.isArray(value) ? value.map(String) : String(value ?? '').split(/[\s,]+/);
	return domains.map((domain) => domain.trim()).filter(Boolean);
}
