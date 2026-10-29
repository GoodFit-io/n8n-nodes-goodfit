import type { INodeProperties } from 'n8n-workflow';
import {
	ENRICHMENT_WAIT,
	includeInputFieldsField,
	paginationFields,
	requestIdField,
	sinceFilters,
	waitForCompletionFields,
} from '../../shared/descriptions';
import { criteriaFields } from '../../shared/criteria';

const forCompany = { resource: ['company'] };
const forEnrich = { ...forCompany, operation: ['enrich'] };

export const companyDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forCompany },
		options: [
			{
				name: 'Enrich',
				value: 'enrich',
				action: 'Enrich a company',
				description: 'Add a company to your Goodfit dataset by domain or email and return its data',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a company',
				description: 'Get a company from your Goodfit dataset by domain',
			},
			{
				name: 'Get Data Points',
				value: 'getFields',
				action: 'Get company data points',
				description:
					'List the company data points in your Goodfit dataset, with the filter operators each one supports',
			},
			{
				name: 'Get Enrichment Status',
				value: 'getEnrichmentStatus',
				action: 'Get a company enrichment status',
				description: 'Check a company enrichment request submitted earlier',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many companies',
				description: 'List companies in your Goodfit dataset',
			},
			{
				name: 'Search',
				value: 'search',
				action: 'Search companies',
				description: 'Search companies in your Goodfit dataset with a filter expression',
			},
		],
		default: 'enrich',
	},
	{
		displayName: 'Identify By',
		name: 'identifyBy',
		type: 'options',
		options: [
			{ name: 'Domain', value: 'domain' },
			{ name: 'Email', value: 'email', description: 'Use the domain of a work email address' },
		],
		default: 'domain',
		displayOptions: { show: forEnrich },
	},
	{
		displayName: 'Domain',
		name: 'domain',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. goodfit.io',
		displayOptions: {
			show: { resource: ['company'], operation: ['get'] },
		},
		description: 'The exact domain of the company',
	},
	{
		displayName: 'Domain',
		name: 'domain',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. goodfit.io',
		displayOptions: { show: { ...forEnrich, identifyBy: ['domain'] } },
		description: 'The domain of the company to enrich',
	},
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'name@email.com',
		displayOptions: { show: { ...forEnrich, identifyBy: ['email'] } },
		description: 'A work email address. Personal email domains such as gmail.com are rejected.',
	},
	{
		displayName: 'Skip Items Without a Domain',
		name: 'skipEmptyDomain',
		type: 'boolean',
		default: true,
		displayOptions: { show: forEnrich },
		description:
			'Whether to return items with an empty domain or email as Skipped, without calling Goodfit, instead of failing them',
	},
	includeInputFieldsField(forEnrich),
	...waitForCompletionFields(forEnrich, ENRICHMENT_WAIT),
	{
		displayName: 'Include Company Data',
		name: 'includeCompanyData',
		type: 'boolean',
		default: true,
		displayOptions: { show: { ...forEnrich, waitForCompletion: [true] } },
		description:
			'Whether to fetch the company from your dataset once enriched. Needs an API key with Dataset API access.',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: forEnrich },
		options: [
			{
				displayName: 'Force Override External IDs',
				name: 'forceOverrideExternalIds',
				type: 'boolean',
				default: false,
				description: 'Whether to replace CRM record IDs already linked to this company',
			},
			{
				displayName: 'HubSpot Company ID',
				name: 'hubspotId',
				type: 'string',
				default: '',
				description: 'Link the company to this HubSpot record',
			},
			{
				displayName: 'Salesforce Account ID',
				name: 'salesforceId',
				type: 'string',
				default: '',
				description: 'Link the company to this Salesforce record',
			},
		],
	},
	requestIdField({ ...forCompany, operation: ['getEnrichmentStatus'] }),
	...criteriaFields({
		show: { ...forCompany, operation: ['search'] },
		label: 'Filters',
		jsonName: 'filters',
		jsonDescription:
			'A Goodfit filter group. Use the data point names returned by Get Data Points.',
	}),
	...paginationFields({ ...forCompany, operation: ['getAll', 'search'] }),
	{
		displayName: 'Filters',
		name: 'listFilters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { ...forCompany, operation: ['getAll'] } },
		options: sinceFilters('company'),
	},
];
