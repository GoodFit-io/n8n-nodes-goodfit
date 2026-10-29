import type { INodeProperties } from 'n8n-workflow';
import {
	paginationFields,
	waitForCompletionFields,
	type WaitWording,
} from '../../shared/descriptions';
import { criteriaFields } from '../../shared/criteria';
import { EXAMPLE_FILTERS } from '../../shared/filters';

const forSegment = { resource: ['segment'] };
const forOperations = (...operation: string[]) => ({ ...forSegment, operation });

const SEGMENT_WAIT: WaitWording = { task: 'the segment calculation', checkWith: 'Segment → Get' };

const criteriaDescription =
	'The segment criteria, as a Goodfit filter group. Use the data point names returned by Company → Get Data Points.';

const dynamicField: INodeProperties = {
	displayName: 'Dynamic',
	name: 'isDynamic',
	type: 'boolean',
	default: false,
	description:
		'Whether the segment keeps updating as your dataset changes. A dynamic segment with personas searches for contacts after every dataset sync, spending contact credits.',
};

const sizeOptions: INodeProperties[] = [
	{
		displayName: 'Exclude Domains',
		name: 'excludeDomains',
		type: 'string',
		default: '',
		placeholder: 'e.g. goodfit.io, example.com',
		description: 'Company domains to leave out whatever the criteria say, separated by commas',
	},
	{
		displayName: 'Max Companies',
		name: 'maxCompanies',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		description:
			'Cap the segment at this many companies, keeping the first by Order By. 0 means no cap.',
	},
	{
		displayName: 'Order By',
		name: 'orderBy',
		type: 'string',
		default: '',
		placeholder: 'e.g. firmographics/employee_count',
		description: 'The data point that decides which companies stay when Max Companies is set',
	},
	{
		displayName: 'Order Direction',
		name: 'orderDirection',
		type: 'options',
		options: [
			{ name: 'Ascending', value: 'ASC' },
			{ name: 'Descending', value: 'DESC' },
		],
		default: 'DESC',
	},
];

export const segmentDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forSegment },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create a segment',
				description: 'Save a segment and calculate its companies',
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a segment',
				description: 'Delete a segment. Its contacts stay granted to your account.',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a segment',
				description: 'Get a segment’s criteria, status and size',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many segments',
				description: 'List your segments, newest first, with their status and size',
			},
			{
				name: 'Preview',
				value: 'preview',
				action: 'Preview a segment',
				description: 'Count the companies some criteria would include, without saving a segment',
			},
			{
				name: 'Refresh',
				value: 'refresh',
				action: 'Refresh a segment',
				description:
					'Recalculate a segment’s companies and search again for contacts. Each newly granted contact uses a contact credit.',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a segment',
				description: 'Change a segment’s name, criteria or other settings',
			},
		],
		default: 'getAll',
	},
	{
		displayName: 'Segment ID',
		name: 'segmentId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: forOperations('delete', 'get', 'refresh', 'update') },
		description: 'The ID of the segment, as returned by Get Many or Create',
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: forOperations('create') },
		description: 'Unique among your segments',
	},
	...criteriaFields({
		show: forOperations('create', 'preview'),
		label: 'Criteria',
		jsonName: 'criteria',
		jsonDescription: criteriaDescription,
	}),
	{
		displayName: 'Sample Size',
		name: 'sample',
		type: 'number',
		default: 10,
		typeOptions: { minValue: 0, maxValue: 50 },
		displayOptions: { show: forOperations('preview') },
		description: 'How many of the matching companies to return with the count, up to 50',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: forOperations('create') },
		options: [dynamicField, ...sizeOptions],
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: forOperations('preview') },
		options: sizeOptions,
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: forOperations('update') },
		options: [
			{
				displayName: 'Criteria',
				name: 'criteria',
				type: 'json',
				default: EXAMPLE_FILTERS,
				description:
					'New segment criteria, as a Goodfit filter group. Changing them recalculates the segment.',
			},
			dynamicField,
			...sizeOptions.slice(0, 2),
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Unique among your segments',
			},
			...sizeOptions.slice(2),
		],
	},
	...waitForCompletionFields(forOperations('create', 'refresh', 'update'), SEGMENT_WAIT),
	...paginationFields(forOperations('getAll')),
];
