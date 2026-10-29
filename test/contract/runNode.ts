import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
} from 'n8n-workflow';
import { GoodFit } from '../../nodes/GoodFit/GoodFit.node';
import { createSpecServer, type Responder } from './specServer';

export const BASE_URL = 'https://api.goodfit.io';

type ParameterValue = unknown | ((itemIndex: number) => unknown);

export interface NodeRun {
	parameters: Record<string, ParameterValue>;
	items?: IDataObject[];
	continueOnFail?: boolean;
	respond: Responder;
}

export async function runNode(run: NodeRun) {
	const server = createSpecServer(run.respond);
	const context = executeContext(run, server.handle);
	let output: INodeExecutionData[] = [];
	let error: unknown;
	try {
		[output] = await new GoodFit().execute.call(context);
	} catch (thrown) {
		error = thrown;
	}
	return { output: output.map((item) => item.json), items: output, error, ...server };
}

function executeContext(
	run: NodeRun,
	handle: ReturnType<typeof createSpecServer>['handle'],
): IExecuteFunctions {
	const items = (run.items ?? [{}]).map((json) => ({ json }));
	const node = {
		id: 'goodfit',
		name: 'Goodfit',
		type: 'goodFit',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	};

	return {
		getInputData: () => items,
		getNode: () => node,
		continueOnFail: () => run.continueOnFail ?? false,
		getCredentials: async () => ({ apiKey: 'test-key', baseUrl: BASE_URL }),
		getNodeParameter: (name: string, itemIndex: number, fallback?: unknown) =>
			parameterValue(run.parameters, name, itemIndex, fallback),
		helpers: {
			httpRequestWithAuthentication: (_credential: string, options: IHttpRequestOptions) =>
				handle(options),
		},
	} as unknown as IExecuteFunctions;
}

function parameterValue(
	parameters: Record<string, ParameterValue>,
	name: string,
	itemIndex: number,
	fallback: unknown,
) {
	const value = name
		.split('.')
		.reduce<unknown>(
			(found, key) => (found as Record<string, unknown> | undefined)?.[key],
			parameters,
		);
	if (value === undefined) {
		if (fallback !== undefined) return fallback;
		throw new Error(`Test did not set node parameter "${name}"`);
	}
	return typeof value === 'function' ? (value as (index: number) => unknown)(itemIndex) : value;
}
