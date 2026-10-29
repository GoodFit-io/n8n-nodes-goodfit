import type { IDataObject } from 'n8n-workflow';
import { throwForItem } from './errors';
import {
	pollUntilSettled,
	systemClock,
	type Clock,
	type PollOutcome,
	type PollSettings,
} from './polling';

export interface AsyncBatchSpec<S extends IDataObject> {
	skippedOutput?(itemIndex: number): IDataObject | undefined;
	requestBody(itemIndex: number): IDataObject | Promise<IDataObject>;
	requestIdOf?(response: IDataObject): string;
	submit(itemIndex: number, body: IDataObject): Promise<IDataObject>;
	fetchStatus(requestId: string): Promise<S>;
	isSettled(status: S): boolean;
	toOutput(itemIndex: number, status: S): Promise<IDataObject>;
}

export interface AsyncBatchOptions {
	waitForCompletion: boolean;
	continueOnFail: boolean;
	poll: PollSettings;
}

export type ItemResult = { json: IDataObject } | { error: unknown };

type Skipped = { skipped: IDataObject };
type Prepared = { body: IDataObject } | Skipped | { error: unknown };
type Submission = { response: IDataObject; requestId: string } | Skipped | { error: unknown };

// Submits every item, polls them together, then builds each output. Without Continue On Fail every
// phase throws at the first bad item, before doing any more work.
export async function runAsyncBatch<S extends IDataObject>(
	itemCount: number,
	spec: AsyncBatchSpec<S>,
	options: AsyncBatchOptions,
	clock: Clock = systemClock,
): Promise<ItemResult[]> {
	const prepared = await prepareAll(itemCount, spec, options.continueOnFail);
	const submissions = await submitAll(prepared, spec, options.continueOnFail);
	if (!options.waitForCompletion) return submissions.map(toSubmittedResult);

	const outcomes = await pollUntilSettled(
		submissions.flatMap((submission) => ('requestId' in submission ? [submission.requestId] : [])),
		(requestId) => spec.fetchStatus(requestId),
		(status) => spec.isSettled(status),
		{ ...options.poll, stopOnFailure: !options.continueOnFail },
		clock,
	);
	if (!options.continueOnFail) throwFirstPollFailure(submissions, outcomes);

	const results: ItemResult[] = [];
	for (const [itemIndex, submission] of submissions.entries()) {
		const result =
			'requestId' in submission
				? await settle(itemIndex, submission.response, outcomes.get(submission.requestId)!, spec)
				: toSubmittedResult(submission);
		if ('error' in result && !options.continueOnFail) throwForItem(result.error, itemIndex);
		results.push(result);
	}
	return results;
}

async function prepareAll<S extends IDataObject>(
	itemCount: number,
	spec: AsyncBatchSpec<S>,
	continueOnFail: boolean,
): Promise<Prepared[]> {
	const prepared: Prepared[] = [];
	for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) {
		try {
			const skipped = spec.skippedOutput?.(itemIndex);
			prepared.push(skipped ? { skipped } : { body: await spec.requestBody(itemIndex) });
		} catch (error) {
			if (!continueOnFail) throwForItem(error, itemIndex);
			prepared.push({ error });
		}
	}
	return prepared;
}

async function submitAll<S extends IDataObject>(
	prepared: Prepared[],
	spec: AsyncBatchSpec<S>,
	continueOnFail: boolean,
): Promise<Submission[]> {
	const submissions: Submission[] = [];
	for (const [itemIndex, item] of prepared.entries()) {
		if (!('body' in item)) {
			submissions.push(item);
			continue;
		}
		try {
			const response = await spec.submit(itemIndex, item.body);
			submissions.push({
				response,
				requestId: String(spec.requestIdOf?.(response) ?? response.requestId),
			});
		} catch (error) {
			if (!continueOnFail) throwForItem(error, itemIndex);
			submissions.push({ error });
		}
	}
	return submissions;
}

function throwFirstPollFailure<S>(
	submissions: Submission[],
	outcomes: Map<string, PollOutcome<S>>,
) {
	for (const [itemIndex, submission] of submissions.entries()) {
		if (!('requestId' in submission)) continue;
		const outcome = outcomes.get(submission.requestId);
		if (outcome?.kind === 'failed') throwForItem(outcome.error, itemIndex);
	}
}

function toSubmittedResult(submission: Submission): ItemResult {
	if ('skipped' in submission) return { json: submission.skipped };
	return 'error' in submission ? submission : { json: submission.response };
}

async function settle<S extends IDataObject>(
	itemIndex: number,
	submitted: IDataObject,
	outcome: PollOutcome<S>,
	spec: AsyncBatchSpec<S>,
): Promise<ItemResult> {
	if (outcome.kind === 'failed') return { error: outcome.error };
	if (outcome.kind === 'timedOut') {
		return { json: { ...(outcome.status ?? submitted), timedOut: true } };
	}
	try {
		return { json: { ...(await spec.toOutput(itemIndex, outcome.status)), timedOut: false } };
	} catch (error) {
		return { error };
	}
}
