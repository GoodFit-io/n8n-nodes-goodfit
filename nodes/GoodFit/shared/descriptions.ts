import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

type Show = NonNullable<IDisplayOptions['show']>;

export interface WaitWording {
	task: string;
	checkWith: string;
}

export const ENRICHMENT_WAIT: WaitWording = {
	task: 'the enrichment',
	checkWith: 'Get Enrichment Status',
};

const WHEN_WAITING = { show: { '/waitForCompletion': [true] } };

export function waitForCompletionField(show: Show, wording: WaitWording): INodeProperties {
	return {
		displayName: 'Wait for Completion',
		name: 'waitForCompletion',
		noDataExpression: true,
		type: 'boolean',
		default: true,
		displayOptions: { show },
		description: `Whether to wait for ${wording.task} to finish and return the result, or return straight away`,
	};
}

export function optionsCollection(show: Show, options: INodeProperties[]): INodeProperties {
	return {
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show },
		options: [...options].sort((a, b) => a.displayName.localeCompare(b.displayName)),
	};
}

export function waitOptions(wording: WaitWording): INodeProperties[] {
	return [
		{
			displayName: 'Poll Interval (Seconds)',
			name: 'pollIntervalSeconds',
			noDataExpression: true,
			type: 'number',
			default: 5,
			typeOptions: { minValue: 2, maxValue: 60 },
			displayOptions: WHEN_WAITING,
			description: `How often to check whether ${wording.task} has finished`,
		},
		{
			displayName: 'Timeout (Seconds)',
			name: 'timeoutSeconds',
			noDataExpression: true,
			type: 'number',
			default: 300,
			typeOptions: { minValue: 10, maxValue: 3600 },
			displayOptions: WHEN_WAITING,
			description: `How long to wait for ${wording.task} to finish. Anything still running is returned with timedOut set to true; check it later with ${wording.checkWith}.`,
		},
	];
}

export function paginationFields(show: Show): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			displayOptions: { show },
			description: 'Whether to return all results or only up to a given limit',
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			default: 50,
			typeOptions: { minValue: 1 },
			displayOptions: { show: { ...show, returnAll: [false] } },
			description: 'Max number of results to return',
		},
	];
}

export function requestIdField(
	show: Show,
	description = 'The request ID returned when the enrichment was submitted',
): INodeProperties {
	return {
		displayName: 'Request ID',
		name: 'requestId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show },
		description,
	};
}

export function sinceFilters(entity: 'company' | 'contact'): INodeProperties[] {
	const plural = entity === 'company' ? 'companies' : 'contacts';
	return [
		{
			displayName: 'Added Since',
			name: 'addedSince',
			type: 'dateTime',
			default: '',
			description: `Only return ${plural} added on or after this time`,
		},
		{
			displayName: 'Updated Since',
			name: 'updatedSince',
			type: 'dateTime',
			default: '',
			description: `Only return ${plural} updated on or after this time`,
		},
	];
}

export const includeInputFieldsOption: INodeProperties = {
	displayName: 'Include Input Fields',
	name: 'includeInputFields',
	type: 'boolean',
	default: false,
	description:
		'Whether to keep the incoming item’s fields in the output, for example a CRM record ID to write results back to. Goodfit’s fields win when names clash.',
};
