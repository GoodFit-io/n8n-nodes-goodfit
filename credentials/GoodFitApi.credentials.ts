import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class GoodFitApi implements ICredentialType {
	name = 'goodFitApi';

	displayName = 'Goodfit API';

	icon: Icon = { light: 'file:../icons/goodfit.svg', dark: 'file:../icons/goodfit.dark.svg' };

	documentationUrl = 'https://docs.goodfit.io/goodfit-docs/apis/apis-introduction';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Create one in Goodfit under Settings → API Keys. Your account manager enables API access first.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.goodfit.io',
			description: 'Only change this if Goodfit has given you a different API host',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/organisation/credits',
			method: 'GET',
		},
	};
}
