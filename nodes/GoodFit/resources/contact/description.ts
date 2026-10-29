import type { INodeProperties } from 'n8n-workflow';
import {
	ENRICHMENT_WAIT,
	includeInputFieldsField,
	paginationFields,
	requestIdField,
	sinceFilters,
	waitForCompletionFields,
} from '../../shared/descriptions';

const forContact = { resource: ['contact'] };
const forEnrich = { ...forContact, operation: ['enrich'] };
const forResolve = { ...forContact, operation: ['resolveMatch'] };

export const contactDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forContact },
		options: [
			{
				name: 'Enrich',
				value: 'enrich',
				action: 'Enrich a contact',
				description:
					'Find a contact’s work email, and optionally mobile number, from a LinkedIn URL or work email',
			},
			{
				name: 'Get Data Points',
				value: 'getFields',
				action: 'Get contact data points',
				description: 'List the contact data points in your Goodfit dataset',
			},
			{
				name: 'Get Enrichment Status',
				value: 'getEnrichmentStatus',
				action: 'Get a contact enrichment status',
				description: 'Check a contact enrichment request submitted earlier',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many contacts',
				description: 'List contacts in your Goodfit dataset',
			},
			{
				name: 'Resolve Match',
				value: 'resolveMatch',
				action: 'Resolve a contact match',
				description:
					'Pick the person or employment for an enrichment that found several, and enrich that one',
			},
		],
		default: 'enrich',
	},
	{
		displayName: 'LinkedIn URL',
		name: 'linkedInUrl',
		type: 'string',
		default: '',
		placeholder: 'e.g. https://www.linkedin.com/in/example-person',
		displayOptions: { show: forEnrich },
		description:
			'The contact’s LinkedIn profile URL. Provide this, a work email, or a first name, last name and company.',
	},
	{
		displayName: 'Work Email',
		name: 'workEmail',
		type: 'string',
		default: '',
		placeholder: 'name@email.com',
		displayOptions: { show: forEnrich },
		description:
			'The contact’s work email. Provide this, a LinkedIn URL, or a first name, last name and company.',
	},
	{
		displayName: 'Enrich Phone Number',
		name: 'enrichPhoneNumber',
		type: 'boolean',
		default: false,
		displayOptions: { show: forEnrich },
		description:
			'Whether to also look up a mobile number. Uses a phone number credit when one is found.',
	},
	{
		displayName: 'Sync to CRM',
		name: 'syncToCrm',
		type: 'boolean',
		default: false,
		displayOptions: { show: forEnrich },
		description: 'Whether Goodfit should sync the enriched contact to your connected CRM',
	},
	includeInputFieldsField(forEnrich),
	...waitForCompletionFields(forEnrich, ENRICHMENT_WAIT),
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: forEnrich },
		options: [
			{
				displayName: 'Company Domain',
				name: 'companyDomain',
				type: 'string',
				default: '',
				description:
					'With a first and last name, identifies the contact. Otherwise helps pick the right employment.',
			},
			{
				displayName: 'Company Name',
				name: 'companyName',
				type: 'string',
				default: '',
				description:
					'With a first and last name, identifies the contact. Otherwise helps pick the right employment.',
			},
			{
				displayName: 'First Name',
				name: 'firstName',
				type: 'string',
				default: '',
				description:
					'With a last name and a company domain or name, identifies the contact without a LinkedIn URL or email',
			},
			{
				displayName: 'HubSpot Contact ID',
				name: 'hubspotId',
				type: 'string',
				default: '',
				description:
					'Link the contact to this HubSpot record. HubSpot must be connected in Goodfit.',
			},
			{
				displayName: 'Job Title',
				name: 'jobTitle',
				type: 'string',
				default: '',
				description: 'Helps tell apart people with the same name at the company',
			},
			{
				displayName: 'Last Name',
				name: 'lastName',
				type: 'string',
				default: '',
				description: 'With a first name and a company domain or name, identifies the contact',
			},
			{
				displayName: 'Salesforce Contact ID',
				name: 'salesforceId',
				type: 'string',
				default: '',
				description:
					'Link the contact to this Salesforce record. Salesforce must be connected in Goodfit.',
			},
			{
				displayName: 'Selected Candidate ID',
				name: 'selectedCandidateId',
				type: 'string',
				default: '',
				description:
					'When an earlier attempt returned MULTIPLE_PEOPLE_FOUND, the candidateId of the person you mean',
			},
			{
				displayName: 'Selected Company ID',
				name: 'selectedCompanyId',
				type: 'string',
				default: '',
				description:
					'When an earlier attempt returned MULTIPLE_EMPLOYMENTS_FOUND, the companyId of the employment to use',
			},
		],
	},
	requestIdField({ ...forContact, operation: ['getEnrichmentStatus'] }),
	requestIdField(
		forResolve,
		'The request ID of the enrichment that returned MULTIPLE_PEOPLE_FOUND or MULTIPLE_EMPLOYMENTS_FOUND',
	),
	{
		displayName: 'Resolve By',
		name: 'resolveBy',
		type: 'options',
		options: [
			{
				name: 'Person',
				value: 'person',
				description: 'The enrichment returned MULTIPLE_PEOPLE_FOUND with a list of candidates',
			},
			{
				name: 'Employment',
				value: 'employment',
				description:
					'The enrichment returned MULTIPLE_EMPLOYMENTS_FOUND with a list of employments',
			},
		],
		default: 'person',
		displayOptions: { show: forResolve },
		description: 'Which choice the enrichment offered: people (candidates) or employments',
	},
	{
		displayName: 'Candidate ID',
		name: 'candidateId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { ...forResolve, resolveBy: ['person'] } },
		description: 'The candidateId of the person you mean, from the result’s candidates',
	},
	{
		displayName: 'Company ID',
		name: 'companyId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { ...forResolve, resolveBy: ['employment'] } },
		description: 'The companyId of the employment to use, from the result’s employments',
	},
	includeInputFieldsField(forResolve),
	...waitForCompletionFields(forResolve, ENRICHMENT_WAIT),
	...paginationFields({ ...forContact, operation: ['getAll'] }),
	{
		displayName: 'Filters',
		name: 'listFilters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { ...forContact, operation: ['getAll'] } },
		options: [
			{
				displayName: 'Company ID',
				name: 'companyId',
				type: 'string',
				default: '',
				description: 'Only return contacts at this Goodfit company (its __company_id value)',
			},
			...sinceFilters('contact'),
		],
	},
];
