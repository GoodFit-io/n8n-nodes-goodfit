import {
	NodeConnectionTypes,
	NodeOperationError,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { creditDescription, creditOperations } from './resources/credit';
import { segmentDescription } from './resources/segment/description';
import { segmentOperations } from './resources/segment/operations';
import { companyDescription } from './resources/company/description';
import { companyOperations } from './resources/company/operations';
import { contactDescription } from './resources/contact/description';
import { contactOperations } from './resources/contact/operations';
import { criteriaLoadOptions } from './shared/criteria';
import { runOperation } from './shared/execution';
import type { ResourceOperations } from './shared/operation';
import { CREDENTIAL_NAME } from './shared/transport';

const OPERATIONS: Record<string, ResourceOperations> = {
	company: companyOperations,
	contact: contactOperations,
	credit: creditOperations,
	segment: segmentOperations,
};

export class GoodFit implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Goodfit',
		name: 'goodFit',
		icon: { light: 'file:../../icons/goodfit.svg', dark: 'file:../../icons/goodfit.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Enrich companies and contacts, manage segments, and read your Goodfit dataset',
		defaults: { name: 'Goodfit' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: CREDENTIAL_NAME, required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Company', value: 'company' },
					{ name: 'Contact', value: 'contact' },
					{ name: 'Credit', value: 'credit' },
					{ name: 'Segment', value: 'segment' },
				],
				default: 'company',
			},
			...companyDescription,
			...contactDescription,
			...creditDescription,
			...segmentDescription,
		],
	};

	methods = { loadOptions: criteriaLoadOptions };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const resource = this.getNodeParameter('resource', 0) as string;
		const operationName = this.getNodeParameter('operation', 0) as string;
		const operation = OPERATIONS[resource]?.[operationName];
		if (!operation) {
			throw new NodeOperationError(
				this.getNode(),
				`The operation "${operationName}" is not supported for "${resource}"`,
			);
		}
		return [await runOperation.call(this, operation)];
	}
}
