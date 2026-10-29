/// <reference types="vite/client" />
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { IDataObject, IHttpRequestOptions } from 'n8n-workflow';
import type { RawResponse } from '../../nodes/GoodFit/shared/rateLimit';

type Schema = Record<string, unknown>;

interface Parameter {
	name: string;
	in: 'path' | 'query' | 'header';
	required?: boolean;
	schema?: Schema;
}

interface OperationSpec {
	parameters?: Parameter[];
	requestBody?: { required?: boolean; content: Record<string, { schema: Schema }> };
	responses: Record<string, { content?: Record<string, { schema: Schema }> }>;
}

interface OpenApiDocument {
	paths: Record<string, Record<string, OperationSpec>>;
}

export interface CapturedRequest {
	method: string;
	path: string;
	query: IDataObject;
	body?: IDataObject;
}

export type Responder = (request: CapturedRequest) => Partial<RawResponse> & { statusCode: number };

const JSON_CONTENT = 'application/json';

const documents = import.meta.glob<OpenApiDocument>('../../openapi/*.json', {
	eager: true,
	import: 'default',
});

export const specs: Map<string, OpenApiDocument> = new Map(
	Object.entries(documents).map(([file, document]) => [apiName(file), document]),
);

function apiName(file: string): string {
	return file.replace(/^.*\/|\.json$/g, '');
}

const strict = addFormats(new Ajv2020({ strict: false, allErrors: true }));
const coercing = addFormats(new Ajv2020({ strict: false, allErrors: true, coerceTypes: true }));

export function createSpecServer(respond: Responder) {
	const violations: string[] = [];
	const requests: CapturedRequest[] = [];

	async function handle(options: IHttpRequestOptions): Promise<RawResponse> {
		const request = capture(options);
		requests.push(request);
		const label = `${request.method} ${request.path}`;
		const response = { headers: {}, body: undefined, ...respond(request) };

		const api = request.path.split('/')[1];
		const document = specs.get(api);
		if (!document) {
			violations.push(`${label}: no OpenAPI document for the ${api} API in openapi/`);
			return response;
		}

		const match = matchOperation(document, request);
		if (!match) {
			violations.push(`${label}: not in the ${api} OpenAPI spec`);
			return response;
		}
		violations.push(
			...checkParameters(match.operation, match.pathParams, request).map(
				(problem) => `${label}: ${problem}`,
			),
			...checkRequestBody(match.operation, request).map((problem) => `${label}: ${problem}`),
			...checkResponse(match.operation, response).map((problem) => `${label}: ${problem}`),
		);
		return response;
	}

	return { handle, violations, requests };
}

function capture(options: IHttpRequestOptions): CapturedRequest {
	const url = new URL(options.url);
	const query = Object.fromEntries(
		Object.entries((options.qs ?? {}) as IDataObject).filter(([, value]) => value !== undefined),
	);
	return {
		method: (options.method ?? 'GET').toUpperCase(),
		path: decodeURIComponent(url.pathname),
		query,
		body: options.body as IDataObject | undefined,
	};
}

function matchOperation(document: OpenApiDocument, request: CapturedRequest) {
	const literalPathsFirst = Object.entries(document.paths).sort(
		([a], [b]) => placeholderCount(a) - placeholderCount(b),
	);
	for (const [template, methods] of literalPathsFirst) {
		const pathParams = matchTemplate(template, request.path);
		const operation = methods[request.method.toLowerCase()];
		if (pathParams && operation) return { operation, pathParams };
	}
	return undefined;
}

function placeholderCount(template: string): number {
	return template.split('{').length - 1;
}

function matchTemplate(template: string, path: string): Record<string, string> | undefined {
	const names: string[] = [];
	const pattern = template.replace(/\{([^}]+)\}/g, (_, name: string) => {
		names.push(name);
		return '([^/]+)';
	});
	const match = new RegExp(`^${pattern}$`).exec(path);
	return match
		? Object.fromEntries(names.map((name, index) => [name, match[index + 1]]))
		: undefined;
}

function checkParameters(
	operation: OperationSpec,
	pathParams: Record<string, string>,
	request: CapturedRequest,
): string[] {
	const declared = operation.parameters ?? [];
	const values: Record<string, Record<string, unknown>> = {
		path: pathParams,
		query: request.query,
	};
	const problems = Object.keys(request.query)
		.filter(
			(name) => !declared.some((parameter) => parameter.in === 'query' && parameter.name === name),
		)
		.map((name) => `sends query parameter "${name}" the spec does not declare`);

	for (const parameter of declared.filter((parameter) => parameter.in !== 'header')) {
		const value = values[parameter.in][parameter.name];
		if (value === undefined) {
			if (parameter.required)
				problems.push(`omits required ${parameter.in} parameter "${parameter.name}"`);
			continue;
		}
		if (parameter.schema && !validates(coercing, parameter.schema, value)) {
			problems.push(
				`${parameter.in} parameter "${parameter.name}"=${JSON.stringify(value)} fails its schema`,
			);
		}
	}
	return problems;
}

function checkRequestBody(operation: OperationSpec, request: CapturedRequest): string[] {
	const schema = operation.requestBody?.content[JSON_CONTENT]?.schema;
	if (request.body === undefined) {
		return operation.requestBody?.required ? ['omits the required request body'] : [];
	}
	if (!schema) return ['sends a body the spec does not accept'];
	return describeErrors(strict, schema, request.body, 'request body');
}

function checkResponse(operation: OperationSpec, response: RawResponse): string[] {
	const documented = operation.responses[String(response.statusCode)];
	if (!documented)
		return [`test responds ${response.statusCode}, which the spec does not document`];
	const schema = documented.content?.[JSON_CONTENT]?.schema;
	return schema
		? describeErrors(strict, schema, response.body, `test's ${response.statusCode} response`)
		: [];
}

function validates(ajv: Ajv2020, schema: Schema, value: unknown): boolean {
	return compiled(ajv, schema)({ value });
}

function describeErrors(ajv: Ajv2020, schema: Schema, value: unknown, subject: string): string[] {
	const validate = compiled(ajv, schema);
	if (validate({ value })) return [];
	return (validate.errors ?? []).map(
		(error) =>
			`${subject} ${error.instancePath.replace(/^\/value/, '') || '(root)'} ${error.message}`,
	);
}

const cache = new WeakMap<Ajv2020, WeakMap<Schema, ValidateFunction>>();

function compiled(ajv: Ajv2020, schema: Schema): ValidateFunction {
	const schemas = cache.get(ajv) ?? new WeakMap<Schema, ValidateFunction>();
	cache.set(ajv, schemas);
	const existing = schemas.get(schema);
	if (existing) return existing;
	const validate = ajv.compile({
		type: 'object',
		properties: { value: withoutMetaSchema(schema) },
	});
	schemas.set(schema, validate);
	return validate;
}

function withoutMetaSchema(schema: Schema): Schema {
	const body = { ...schema };
	delete body.$schema;
	return body;
}
