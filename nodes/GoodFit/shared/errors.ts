import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export function withItemIndex<E>(error: E, itemIndex: number): E {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) {
		error.context.itemIndex ??= itemIndex;
	}
	return error;
}

export function throwForItem(error: unknown, itemIndex: number): never {
	throw withItemIndex(error, itemIndex);
}
