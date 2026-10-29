import type { IDataObject } from 'n8n-workflow';

export function compact(object: IDataObject): IDataObject {
	return Object.fromEntries(
		Object.entries(object).filter(([, value]) => value !== undefined && value !== ''),
	);
}

export function externalIdsFrom(fields: IDataObject): IDataObject | undefined {
	const externalIds = compact({ salesforce: fields.salesforceId, hubspot: fields.hubspotId });
	return Object.keys(externalIds).length > 0 ? externalIds : undefined;
}
