import type { INodeProperties } from 'n8n-workflow';
import type { ResourceOperations } from '../../shared/operation';
import { goodFitRequest } from '../../shared/transport';

export const creditDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['credit'] } },
		options: [
			{
				name: 'Get Balances',
				value: 'getBalances',
				action: 'Get credit balances',
				description: 'Get your remaining contact and phone number credits and dataset usage limits',
			},
		],
		default: 'getBalances',
	},
];

export const creditOperations: ResourceOperations = {
	getBalances: {
		perItem(itemIndex) {
			return goodFitRequest.call(this, { method: 'GET', path: '/organisation/credits', itemIndex });
		},
	},
};
