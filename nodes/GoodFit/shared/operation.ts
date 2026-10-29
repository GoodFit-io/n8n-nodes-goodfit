import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import type { AsyncBatchOptions, ItemResult } from './asyncBatch';

export type ItemOperation = (
	this: IExecuteFunctions,
	itemIndex: number,
) => Promise<IDataObject | IDataObject[]>;

export type BatchOperation = (this: IExecuteFunctions) => Promise<ItemResult[]>;

export type Operation = { perItem: ItemOperation } | { batch: BatchOperation };

export type ResourceOperations = Record<string, Operation>;

export function asyncBatchOptions(this: IExecuteFunctions): AsyncBatchOptions {
	return {
		waitForCompletion: this.getNodeParameter('waitForCompletion', 0) as boolean,
		continueOnFail: this.continueOnFail(),
		poll: {
			timeoutMs: (this.getNodeParameter('timeoutSeconds', 0, 300) as number) * 1000,
			intervalMs: (this.getNodeParameter('pollIntervalSeconds', 0, 5) as number) * 1000,
		},
	};
}
