import type { IDataObject } from 'n8n-workflow';

export interface Condition {
	dataPoint?: string;
	operator?: string;
	value?: unknown;
	secondValue?: unknown;
	unit?: string;
}

export type Match = 'and' | 'or';

export const OPERATOR_LABELS: Record<string, string> = {
	exists: 'Has a value',
	notExists: 'Has no value',
	stringEqualOneOf: 'Is one of',
	stringNotEqualOneOf: 'Is not one of',
	stringContainsOneOf: 'Contains any of',
	stringNotContainsOneOf: 'Contains none of',
	equalTo: 'Equals',
	notEqualTo: 'Does not equal',
	gt: 'Greater than',
	gte: 'Greater than or equal to',
	lt: 'Less than',
	lte: 'Less than or equal to',
	between: 'Between',
	booleanTrue: 'Is true',
	booleanFalse: 'Is false',
	booleanFalseOrNull: 'Is false or empty',
	arrayContainsAnyOf: 'Includes any of',
	arrayNotContainsAnyOf: 'Includes none of',
	arrayContainsAnySubstring: 'Includes any item containing',
	arrayNotContainsAnySubstring: 'Includes no item containing',
	arrayLengthGt: 'Has more items than',
	arrayLengthGte: 'Has at least this many items',
	arrayLengthLt: 'Has fewer items than',
	arrayLengthLte: 'Has at most this many items',
	dateEqual: 'Is on',
	dateNotEqual: 'Is not on',
	dateSince: 'Is on or after',
	dateBefore: 'Is before',
	dateBetween: 'Is between dates',
	dateSinceRelative: 'Is within the last',
	dateBeforeRelative: 'Is longer ago than',
};

export const VALUELESS_OPERATORS = [
	'exists',
	'notExists',
	'booleanTrue',
	'booleanFalse',
	'booleanFalseOrNull',
];
export const PAIRED_OPERATORS = ['between', 'dateBetween'];
export const RELATIVE_OPERATORS = ['dateSinceRelative', 'dateBeforeRelative'];

const LIST_OPERATORS = new Set([
	'stringEqualOneOf',
	'stringNotEqualOneOf',
	'stringContainsOneOf',
	'stringNotContainsOneOf',
	'arrayContainsAnyOf',
	'arrayNotContainsAnyOf',
	'arrayContainsAnySubstring',
	'arrayNotContainsAnySubstring',
]);
const NUMBER_OPERATORS = new Set([
	'gt',
	'gte',
	'lt',
	'lte',
	'arrayLengthGt',
	'arrayLengthGte',
	'arrayLengthLt',
	'arrayLengthLte',
]);
const EQUALITY_OPERATORS = new Set(['equalTo', 'notEqualTo']);
const NUMERIC_FIELD_TYPES = new Set(['Number', 'Integer', 'Percentage', 'Currency']);

export function needsFieldTypes(conditions: Condition[]): boolean {
	return conditions.some((condition) => EQUALITY_OPERATORS.has(condition.operator ?? ''));
}

export function buildFilterGroup(
	conditions: Condition[],
	match: Match,
	fieldTypeOf: (fieldName: string) => string | undefined = () => undefined,
): IDataObject {
	return {
		id: 'root',
		combinator: match,
		rules: conditions.map((condition, index) => buildRule(condition, `r${index + 1}`, fieldTypeOf)),
	};
}

function buildRule(
	condition: Condition,
	id: string,
	fieldTypeOf: (fieldName: string) => string | undefined,
): IDataObject {
	const { dataPoint, operator } = condition;
	if (!dataPoint || !operator) throw new Error('Each condition needs a data point and an operator');
	const rule: IDataObject = { id, field: dataPoint, operator };
	if (!VALUELESS_OPERATORS.includes(operator)) {
		rule.value = ruleValue(condition, operator, fieldTypeOf(dataPoint));
	}
	return rule;
}

type RuleValue = string | number | string[] | number[] | IDataObject;

function ruleValue(
	condition: Condition,
	operator: string,
	fieldType: string | undefined,
): RuleValue {
	const { value, secondValue } = condition;
	if (LIST_OPERATORS.has(operator)) return listOf(value);
	if (NUMBER_OPERATORS.has(operator)) return numberOf(value);
	if (operator === 'between') return [numberOf(value), numberOf(secondValue)];
	if (operator === 'dateBetween') return [textOf(value), textOf(secondValue)];
	if (RELATIVE_OPERATORS.includes(operator)) {
		return { unit: condition.unit ?? 'DAY', amount: numberOf(value) };
	}
	if (EQUALITY_OPERATORS.has(operator) && NUMERIC_FIELD_TYPES.has(fieldType ?? ''))
		return numberOf(value);
	return textOf(value);
}

function listOf(value: unknown): string[] {
	const items = Array.isArray(value) ? value.map(String) : String(value ?? '').split(',');
	const list = items.map((item) => item.trim()).filter(Boolean);
	if (list.length === 0) throw new Error('Enter at least one value, separated by commas');
	return list;
}

function numberOf(value: unknown): number {
	const number = typeof value === 'number' ? value : Number(String(value ?? '').trim());
	if (String(value ?? '').trim() === '' || !Number.isFinite(number)) {
		throw new Error(`"${String(value ?? '')}" is not a number`);
	}
	return number;
}

function textOf(value: unknown): string {
	const text = String(value ?? '').trim();
	if (!text) throw new Error('Enter a value for each condition that needs one');
	return text;
}
