import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class GoodFitWebhookApi implements ICredentialType {
	name = 'goodFitWebhookApi';

	displayName = 'Goodfit Webhook API';

	icon: Icon = { light: 'file:../icons/goodfit.svg', dark: 'file:../icons/goodfit.dark.svg' };

	documentationUrl = 'https://docs.goodfit.io/goodfit-docs/product/integrations/webhooks';

	properties: INodeProperties[] = [
		{
			displayName: 'Signing Secret',
			name: 'signingSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'The HMAC secret set on the Goodfit webhook connector',
		},
	];
}
