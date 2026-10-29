import { NodeApiError } from 'n8n-workflow';
import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { sendHonouringRetryAfter, type RawResponse } from './rateLimit';

export const CREDENTIAL_NAME = 'goodFitApi';

export type GoodFitContext = IExecuteFunctions | ILoadOptionsFunctions;

const NOT_FOUND = 404;

const ACCESS_HINTS: Record<string, string> = {
	UNAUTHENTICATED:
		'Goodfit didn’t accept the API key. Check the key in your Goodfit API credential.',
	FORBIDDEN:
		'This API key can’t use this Goodfit API. Create a key with the right scope in Goodfit under Settings → API Keys, or ask your account manager to enable the API.',
};

export interface GoodFitRequest {
	method: IHttpRequestMethods;
	path: string;
	body?: IDataObject;
	qs?: IDataObject;
	itemIndex?: number;
}

export async function goodFitRequest(
	this: GoodFitContext,
	request: GoodFitRequest,
): Promise<IDataObject> {
	const response = await send.call(this, request);
	if (response.statusCode >= 400) throw toNodeApiError.call(this, response, request.itemIndex);
	return response.body as IDataObject;
}

export async function goodFitFind(
	this: GoodFitContext,
	request: GoodFitRequest,
): Promise<IDataObject | null> {
	const response = await send.call(this, request);
	if (response.statusCode === NOT_FOUND) return null;
	if (response.statusCode >= 400) throw toNodeApiError.call(this, response, request.itemIndex);
	return response.body as IDataObject;
}

async function send(this: GoodFitContext, request: GoodFitRequest): Promise<RawResponse> {
	const { baseUrl } = await this.getCredentials<{ baseUrl: string }>(CREDENTIAL_NAME);
	const options = toHttpOptions(baseUrl, request);
	try {
		return await sendHonouringRetryAfter(
			() =>
				this.helpers.httpRequestWithAuthentication.call(
					this,
					CREDENTIAL_NAME,
					options,
				) as Promise<RawResponse>,
		);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: request.itemIndex });
	}
}

function toHttpOptions(baseUrl: string, request: GoodFitRequest): IHttpRequestOptions {
	return {
		method: request.method,
		url: `${baseUrl.replace(/\/+$/, '')}${request.path}`,
		body: request.body,
		qs: request.qs,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
}

function toNodeApiError(this: GoodFitContext, response: RawResponse, itemIndex?: number) {
	const envelope = (response.body ?? {}) as { error?: string; code?: string };
	return new NodeApiError(this.getNode(), envelope as JsonObject, {
		httpCode: String(response.statusCode),
		message: envelope.error ?? `Goodfit API responded with status ${response.statusCode}`,
		description:
			ACCESS_HINTS[envelope.code ?? ''] ??
			(envelope.code ? `Goodfit error code: ${envelope.code}` : undefined),
		itemIndex,
	});
}

export function readableError(error: unknown): string {
	if (!(error instanceof Error)) return String(error);
	const description = (error as { description?: unknown }).description;
	return typeof description === 'string' && description
		? `${error.message}. ${description}`
		: error.message;
}
