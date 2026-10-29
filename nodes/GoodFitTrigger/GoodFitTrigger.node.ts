import {
	NodeConnectionTypes,
	type ICredentialsDecrypted,
	type ICredentialTestFunctions,
	type IHookFunctions,
	type INodeCredentialTestResult,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
} from 'n8n-workflow';
import { isSubscribed, recordsFrom, type GoodFitEvent, type WebhookEnvelope } from './payload';
import { isValidSignature, SIGNATURE_HEADER } from './signature';

const SIGNING_CREDENTIAL = 'goodFitWebhookApi';

export class GoodFitTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Goodfit Trigger',
		name: 'goodFitTrigger',
		icon: { light: 'file:../../icons/goodfit.svg', dark: 'file:../../icons/goodfit.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle:
			'={{$parameter["events"].map(event => event === "account" ? "Company" : "Contact").join(", ")}}',
		// n8n's node panel merges this trigger with the Goodfit node and shows this description for both.
		description:
			'Enrich and search companies and contacts, manage segments, or start a workflow when Goodfit syncs them',
		defaults: { name: 'Goodfit Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'goodFitWebhookApi',
				required: true,
				testedBy: 'signingSecretIsUsable',
				displayOptions: { show: { authentication: ['signature'] } },
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				responseData: '',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'Copy the production webhook URL above into Goodfit under Settings → Connectors → Webhook, as the companies URL, the contacts URL, or both',
				name: 'setupNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				options: [
					{
						name: 'Company Synced',
						value: 'account',
						description: 'Goodfit sent a company to the companies URL',
					},
					{
						name: 'Contact Synced',
						value: 'contact',
						description: 'Goodfit sent a contact to the contacts URL',
					},
				],
				default: ['account', 'contact'],
			},
			{
				displayName:
					'Without a signing secret, anyone who knows this URL can start the workflow. Set one on the Goodfit webhook connector and choose Signing Secret below.',
				name: 'authenticationNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { authentication: ['none'] } },
			},
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: [
					{ name: 'None', value: 'none' },
					{
						name: 'Signing Secret',
						value: 'signature',
						description: 'Reject requests without a valid x-goodfit-hmac-sha256 signature',
					},
				],
				default: 'none',
			},
		],
	};

	methods = {
		credentialTest: {
			async signingSecretIsUsable(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const secret = String(credential.data?.signingSecret ?? '');
				return secret.trim()
					? {
							status: 'OK',
							message: 'Saved. The secret is checked against each signed request Goodfit sends.',
						}
					: {
							status: 'Error',
							message: 'Enter the signing secret set on the Goodfit webhook connector',
						};
			},
		},
	};

	webhookMethods = {
		default: {
			// GoodFit has no public API for webhook registration; users paste the URL into the app.
			async checkExists(this: IHookFunctions): Promise<boolean> {
				return true;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		if (!(await isAuthentic.call(this))) {
			return respond.call(this, 401, { error: 'Invalid signature' });
		}

		const envelope = this.getBodyData() as WebhookEnvelope;
		const events = this.getNodeParameter('events', []) as GoodFitEvent[];
		if (!isSubscribed(envelope, events)) return respond.call(this, 200, { ignored: true });

		const records = recordsFrom(envelope);
		if (records.length === 0) return { webhookResponse: { received: 0 } };
		return {
			webhookResponse: { received: records.length },
			workflowData: [this.helpers.returnJsonArray(records)],
		};
	}
}

async function isAuthentic(this: IWebhookFunctions): Promise<boolean> {
	if (this.getNodeParameter('authentication', 'none') !== 'signature') return true;
	const { signingSecret } = await this.getCredentials<{ signingSecret: string }>(
		SIGNING_CREDENTIAL,
	);
	return hasValidSignature.call(this, signingSecret);
}

function hasValidSignature(this: IWebhookFunctions, secret: string): boolean {
	const signature = this.getHeaderData()[SIGNATURE_HEADER];
	const rawBody = this.getRequestObject().rawBody;
	return isValidSignature(rawBody, typeof signature === 'string' ? signature : undefined, secret);
}

function respond(this: IWebhookFunctions, status: number, body: object): IWebhookResponseData {
	this.getResponseObject().status(status).json(body);
	return { noWebhookResponse: true };
}
