import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { ItemResult } from './asyncBatch';
import { withItemIndex } from './errors';
import type { ItemOperation, Operation } from './operation';

type OperationResult = ItemResult | { many: IDataObject[] };

export async function runOperation(
	this: IExecuteFunctions,
	operation: Operation,
): Promise<INodeExecutionData[]> {
	const results: OperationResult[] =
		'batch' in operation
			? await operation.batch.call(this)
			: await runPerItem.call(this, operation.perItem);
	return results.flatMap((result, itemIndex) => toExecutionData.call(this, result, itemIndex));
}

async function runPerItem(
	this: IExecuteFunctions,
	operation: ItemOperation,
): Promise<OperationResult[]> {
	const results: OperationResult[] = [];
	for (let itemIndex = 0; itemIndex < this.getInputData().length; itemIndex++) {
		try {
			const output = await operation.call(this, itemIndex);
			results.push(Array.isArray(output) ? { many: output } : { json: output });
		} catch (error) {
			if (!this.continueOnFail()) throw asNodeError.call(this, error, itemIndex);
			results.push({ error });
		}
	}
	return results;
}

function toExecutionData(
	this: IExecuteFunctions,
	result: OperationResult,
	itemIndex: number,
): INodeExecutionData[] {
	const pairedItem = { item: itemIndex };
	if ('error' in result) {
		if (!this.continueOnFail()) throw asNodeError.call(this, result.error, itemIndex);
		const json = { error: errorMessage(result.error) };
		return [{ json: withInputFields.call(this, json, itemIndex), pairedItem }];
	}
	const outputs = 'many' in result ? result.many : [result.json];
	return outputs.map((json) => ({ json: withInputFields.call(this, json, itemIndex), pairedItem }));
}

function withInputFields(
	this: IExecuteFunctions,
	json: IDataObject,
	itemIndex: number,
): IDataObject {
	const includeInputFields = this.getNodeParameter(
		'includeInputFields',
		itemIndex,
		false,
	) as boolean;
	return includeInputFields ? { ...this.getInputData()[itemIndex].json, ...json } : json;
}

function asNodeError(this: IExecuteFunctions, error: unknown, itemIndex: number) {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) {
		return withItemIndex(error, itemIndex);
	}
	return new NodeOperationError(this.getNode(), error as Error, { itemIndex });
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
