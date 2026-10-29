import { sleep } from 'n8n-workflow';

export interface PollSettings {
	timeoutMs: number;
	intervalMs: number;
	stopOnFailure?: boolean;
}

export interface Clock {
	now(): number;
	wait(ms: number): Promise<void>;
}

export type PollOutcome<S> =
	| { kind: 'settled'; status: S }
	| { kind: 'timedOut'; status?: S }
	| { kind: 'failed'; error: unknown };

export const systemClock: Clock = { now: () => Date.now(), wait: sleep };

export const MAX_CONSECUTIVE_FAILURES = 3;

interface PollState<S> {
	outcomes: Map<string, PollOutcome<S>>;
	lastStatus: Map<string, S>;
	failures: Map<string, number>;
}

export async function pollUntilSettled<S>(
	requestIds: string[],
	fetchStatus: (requestId: string) => Promise<S>,
	isSettled: (status: S) => boolean,
	settings: PollSettings,
	clock: Clock = systemClock,
): Promise<Map<string, PollOutcome<S>>> {
	const state: PollState<S> = { outcomes: new Map(), lastStatus: new Map(), failures: new Map() };
	const deadline = clock.now() + settings.timeoutMs;
	let pending = [...new Set(requestIds)];

	while (pending.length > 0 && clock.now() < deadline) {
		await clock.wait(Math.min(settings.intervalMs, deadline - clock.now()));
		pending = await pollRound(pending, fetchStatus, isSettled, state, () => clock.now() > deadline);
		if (settings.stopOnFailure && hasFailure(state)) break;
	}

	for (const requestId of pending) {
		state.outcomes.set(requestId, { kind: 'timedOut', status: state.lastStatus.get(requestId) });
	}
	return state.outcomes;
}

function hasFailure<S>(state: PollState<S>): boolean {
	return [...state.outcomes.values()].some((outcome) => outcome.kind === 'failed');
}

async function pollRound<S>(
	pending: string[],
	fetchStatus: (requestId: string) => Promise<S>,
	isSettled: (status: S) => boolean,
	state: PollState<S>,
	pastDeadline: () => boolean,
): Promise<string[]> {
	const stillPending: string[] = [];
	for (const [position, requestId] of pending.entries()) {
		if (pastDeadline()) return [...stillPending, ...pending.slice(position)];
		if (await checkOnce(requestId, fetchStatus, isSettled, state)) continue;
		stillPending.push(requestId);
	}
	return stillPending;
}

async function checkOnce<S>(
	requestId: string,
	fetchStatus: (requestId: string) => Promise<S>,
	isSettled: (status: S) => boolean,
	state: PollState<S>,
): Promise<boolean> {
	try {
		const status = await fetchStatus(requestId);
		state.lastStatus.set(requestId, status);
		state.failures.set(requestId, 0);
		if (!isSettled(status)) return false;
		state.outcomes.set(requestId, { kind: 'settled', status });
		return true;
	} catch (error) {
		const failures = (state.failures.get(requestId) ?? 0) + 1;
		state.failures.set(requestId, failures);
		if (failures < MAX_CONSECUTIVE_FAILURES) return false;
		state.outcomes.set(requestId, { kind: 'failed', error });
		return true;
	}
}
