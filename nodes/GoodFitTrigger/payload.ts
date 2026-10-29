import type { IDataObject } from 'n8n-workflow';

export type GoodFitEvent = 'account' | 'contact';

export interface WebhookEnvelope {
	type?: string;
	source?: string;
	body?: IDataObject | IDataObject[];
}

export function recordsFrom(envelope: WebhookEnvelope): IDataObject[] {
	const { body } = envelope;
	if (body === undefined || body === null) return [];
	const records = Array.isArray(body) ? body : [body];
	return records.map((record) => ({ ...record, event: envelope.type }));
}

export function isSubscribed(envelope: WebhookEnvelope, events: GoodFitEvent[]): boolean {
	return events.includes(envelope.type as GoodFitEvent);
}
