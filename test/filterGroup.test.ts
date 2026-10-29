import { describe, expect, it } from 'vitest';
import type { IDataObject } from 'n8n-workflow';
import { buildFilterGroup, needsFieldTypes } from '../nodes/GoodFit/shared/filterGroup';

const rulesOf = (...conditions: Parameters<typeof buildFilterGroup>[0]) =>
	buildFilterGroup(conditions, 'and').rules as IDataObject[];

describe('buildFilterGroup', () => {
	it('builds a root group with numbered rules and the chosen combinator', () => {
		expect(buildFilterGroup([{ dataPoint: 'country', operator: 'exists' }], 'or')).toEqual({
			id: 'root',
			combinator: 'or',
			rules: [{ id: 'r1', field: 'country', operator: 'exists' }],
		});
	});

	it('sends no value for operators that take none', () => {
		expect(rulesOf({ dataPoint: 'sells_saas', operator: 'booleanTrue', value: 'ignored' })).toEqual(
			[{ id: 'r1', field: 'sells_saas', operator: 'booleanTrue' }],
		);
	});

	it('splits comma-separated values into a list', () => {
		expect(
			rulesOf({ dataPoint: 'country', operator: 'stringEqualOneOf', value: 'US, GB ,  DE' }),
		).toEqual([
			{ id: 'r1', field: 'country', operator: 'stringEqualOneOf', value: ['US', 'GB', 'DE'] },
		]);
	});

	it('accepts a list from an expression as it is', () => {
		const [rule] = rulesOf({
			dataPoint: 'tech',
			operator: 'arrayContainsAnyOf',
			value: ['HubSpot', 'Salesforce'],
		});
		expect(rule).toMatchObject({ value: ['HubSpot', 'Salesforce'] });
	});

	it('turns comparisons into numbers and between into a pair', () => {
		expect(
			rulesOf(
				{ dataPoint: 'employees', operator: 'gte', value: '50' },
				{ dataPoint: 'employees', operator: 'between', value: '50', secondValue: '500' },
			).map((rule) => rule.value),
		).toEqual([50, [50, 500]]);
	});

	it('keeps dates as text and builds relative dates from a number and unit', () => {
		expect(
			rulesOf(
				{
					dataPoint: 'founded',
					operator: 'dateBetween',
					value: '2020-01-01',
					secondValue: '2024-12-31',
				},
				{ dataPoint: 'last_funding', operator: 'dateSinceRelative', value: '6', unit: 'MONTH' },
			).map((rule) => rule.value),
		).toEqual([['2020-01-01', '2024-12-31'], { unit: 'MONTH', amount: 6 }]);
	});

	it('sends a number for Equals on a numeric data point and text otherwise', () => {
		const types: Record<string, string> = { employees: 'Integer', country: 'Picklist' };
		const group = buildFilterGroup(
			[
				{ dataPoint: 'employees', operator: 'equalTo', value: '120' },
				{ dataPoint: 'country', operator: 'equalTo', value: '120' },
			],
			'and',
			(fieldName) => types[fieldName],
		);
		expect((group.rules as Array<{ value: unknown }>).map((rule) => rule.value)).toEqual([
			120,
			'120',
		]);
	});

	it.each([
		[{ operator: 'exists' }, 'Each condition needs a data point and an operator'],
		[{ dataPoint: 'employees', operator: 'gt', value: 'lots' }, '"lots" is not a number'],
		[{ dataPoint: 'employees', operator: 'gt', value: '' }, '"" is not a number'],
		[
			{ dataPoint: 'country', operator: 'stringEqualOneOf', value: ' , ' },
			'Enter at least one value, separated by commas',
		],
		[
			{ dataPoint: 'founded', operator: 'dateSince', value: '' },
			'Enter a value for each condition that needs one',
		],
	])('rejects %o with a clear message', (condition, message) => {
		expect(() => rulesOf(condition)).toThrow(message);
	});

	it('looks up data point types only when Equals or Does not equal is used', () => {
		expect(needsFieldTypes([{ dataPoint: 'a', operator: 'gt' }])).toBe(false);
		expect(needsFieldTypes([{ dataPoint: 'a', operator: 'notEqualTo' }])).toBe(true);
	});
});
