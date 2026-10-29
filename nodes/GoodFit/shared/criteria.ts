import {
	NodeOperationError,
	type IDataObject,
	type IDisplayOptions,
	type IExecuteFunctions,
	type ILoadOptionsFunctions,
	type INodeProperties,
	type INodePropertyOptions,
} from 'n8n-workflow';
import { EXAMPLE_FILTERS, parseJsonParameter } from './filters';
import {
	buildFilterGroup,
	needsFieldTypes,
	OPERATOR_LABELS,
	PAIRED_OPERATORS,
	RELATIVE_OPERATORS,
	VALUELESS_OPERATORS,
	type Condition,
	type Match,
} from './filterGroup';
import { goodFitRequest, readableError, type GoodFitContext } from './transport';

type Show = NonNullable<IDisplayOptions['show']>;

interface DataPoint {
	fieldName: string;
	displayName: string;
	fieldType: string;
	operators: string[];
	description: string | null;
	isIntel?: boolean;
}

export interface CriteriaFieldsOptions {
	show: Show;
	label: 'Criteria' | 'Filters';
	jsonName: string;
	jsonDescription: string;
}

const BUILDER = 'builder';
const COMPANY_FIELDS = '/dataset/companies/fields';

export function criteriaFields({
	show,
	label,
	jsonName,
	jsonDescription,
}: CriteriaFieldsOptions): INodeProperties[] {
	const usingBuilder = { show: { ...show, criteriaMode: [BUILDER] } };
	return [
		{
			displayName: `Define ${label}`,
			name: 'criteriaMode',
			type: 'options',
			noDataExpression: true,
			options: [
				{ name: 'Using Fields Below', value: BUILDER },
				{ name: 'Using JSON', value: 'json' },
			],
			default: BUILDER,
			displayOptions: { show },
		},
		{
			displayName: 'Match',
			name: 'match',
			type: 'options',
			options: [
				{ name: 'All Conditions', value: 'and' },
				{ name: 'Any Condition', value: 'or' },
			],
			default: 'and',
			displayOptions: usingBuilder,
		},
		{
			displayName: 'Conditions',
			name: 'conditions',
			type: 'fixedCollection',
			placeholder: 'Add Condition',
			typeOptions: { multipleValues: true },
			default: {},
			displayOptions: usingBuilder,
			options: [{ displayName: 'Condition', name: 'condition', values: conditionFields() }],
		},
		{
			displayName: label,
			name: jsonName,
			type: 'json',
			required: true,
			default: EXAMPLE_FILTERS,
			displayOptions: { show: { ...show, criteriaMode: ['json'] } },
			description: jsonDescription,
		},
	];
}

function conditionFields(): INodeProperties[] {
	return [
		{
			displayName: 'Data Point Name or ID',
			name: 'dataPoint',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getDataPoints' },
			default: '',
			description:
				'The data point to check. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		},
		{
			displayName: 'Operator Name or ID',
			name: 'operator',
			type: 'options',
			typeOptions: {
				loadOptionsMethod: 'getDataPointOperators',
				loadOptionsDependsOn: ['&dataPoint'],
			},
			default: '',
			description:
				'The operators this data point supports. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		},
		{
			displayName: 'Value',
			name: 'value',
			type: 'string',
			default: '',
			displayOptions: { hide: { operator: [...VALUELESS_OPERATORS] } },
			description:
				'For "one of" and "contains" operators, separate values with commas. For "within the last", enter a number.',
		},
		{
			displayName: 'Second Value',
			name: 'secondValue',
			type: 'string',
			default: '',
			displayOptions: { show: { operator: [...PAIRED_OPERATORS] } },
			description: 'The upper end of the range',
		},
		{
			displayName: 'Unit',
			name: 'unit',
			type: 'options',
			options: [
				{ name: 'Days', value: 'DAY' },
				{ name: 'Weeks', value: 'WEEK' },
				{ name: 'Months', value: 'MONTH' },
				{ name: 'Years', value: 'YEAR' },
			],
			default: 'DAY',
			displayOptions: { show: { operator: [...RELATIVE_OPERATORS] } },
		},
	];
}

export async function criteriaFromParameters(
	this: IExecuteFunctions,
	itemIndex: number,
	jsonName: string,
): Promise<IDataObject> {
	if (this.getNodeParameter('criteriaMode', itemIndex, BUILDER) !== BUILDER) {
		return parseJsonParameter(this.getNodeParameter(jsonName, itemIndex) as string | IDataObject);
	}
	const conditions = this.getNodeParameter('conditions.condition', itemIndex, []) as Condition[];
	const match = this.getNodeParameter('match', itemIndex, 'and') as Match;
	const fieldTypes = needsFieldTypes(conditions)
		? await fieldTypesOf.call(this, itemIndex)
		: new Map();
	try {
		return buildFilterGroup(conditions, match, (fieldName) => fieldTypes.get(fieldName));
	} catch (error) {
		throw new NodeOperationError(this.getNode(), (error as Error).message, { itemIndex });
	}
}

async function fieldTypesOf(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<Map<string, string>> {
	const dataPoints = await companyDataPoints.call(this, itemIndex);
	return new Map(dataPoints.map((dataPoint) => [dataPoint.fieldName, dataPoint.fieldType]));
}

async function companyDataPoints(this: GoodFitContext, itemIndex?: number): Promise<DataPoint[]> {
	const response = await goodFitRequest.call(this, {
		method: 'GET',
		path: COMPANY_FIELDS,
		itemIndex,
	});
	return (response.fields as DataPoint[] | undefined) ?? [];
}

async function dataPointsForDropdown(this: ILoadOptionsFunctions): Promise<DataPoint[]> {
	try {
		return await companyDataPoints.call(this);
	} catch (error) {
		throw new NodeOperationError(
			this.getNode(),
			`Couldn’t load your data points: ${readableError(error)}`,
		);
	}
}

async function getDataPoints(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const dataPoints = await dataPointsForDropdown.call(this);
	return dataPoints
		.map((dataPoint) => ({
			name: dataPoint.isIntel ? `${dataPoint.displayName} (intel)` : dataPoint.displayName,
			value: dataPoint.fieldName,
			description: dataPoint.description ?? undefined,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

async function getDataPointOperators(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const chosen = this.getCurrentNodeParameter('&dataPoint') as string | undefined;
	const dataPoints = await dataPointsForDropdown.call(this);
	const operators =
		dataPoints.find((dataPoint) => dataPoint.fieldName === chosen)?.operators ??
		Object.keys(OPERATOR_LABELS);
	return operators.map((operator) => ({
		name: OPERATOR_LABELS[operator] ?? operator,
		value: operator,
	}));
}

export const criteriaLoadOptions = { getDataPoints, getDataPointOperators };
