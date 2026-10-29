/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import type { IDataObject, INodeProperties } from 'n8n-workflow';
import { GoodFit } from '../nodes/GoodFit/GoodFit.node';

interface ExampleNode {
	name: string;
	type: string;
	parameters: IDataObject;
	[key: string]: unknown;
}

interface ExampleWorkflow {
	name: string;
	nodes: ExampleNode[];
	[key: string]: unknown;
}

const examples = import.meta.glob<ExampleWorkflow>('../examples/*.json', {
	eager: true,
	import: 'default',
});

const GOODFIT_TYPE = 'n8n-nodes-goodfit.goodFit';
const properties = new GoodFit().description.properties;

function shownFor(property: INodeProperties, parameters: IDataObject): boolean {
	const show = property.displayOptions?.show ?? {};
	return Object.entries(show).every(([name, allowed]) =>
		(allowed as unknown[]).includes(parameters[name]),
	);
}

function unknownParameters(parameters: IDataObject): string[] {
	const visible = properties.filter((property) => shownFor(property, parameters));
	return Object.entries(parameters).flatMap(([name, value]) => {
		const property = visible.find((candidate) => candidate.name === name);
		if (!property) return [name];
		if (property.type !== 'collection') return [];
		const options = (property.options as INodeProperties[]).map((option) => option.name);
		return Object.keys(value as IDataObject)
			.filter((key) => !options.includes(key))
			.map((key) => `${name}.${key}`);
	});
}

describe.each(Object.entries(examples))('example %s', (_file, workflow) => {
	const goodFitNodes = workflow.nodes.filter((node) => node.type === GOODFIT_TYPE);

	it('uses the Goodfit node', () => {
		expect(goodFitNodes.length).toBeGreaterThan(0);
	});

	it('only sets Goodfit parameters that exist for the chosen operation', () => {
		for (const node of goodFitNodes) {
			expect(unknownParameters(node.parameters), node.name).toEqual([]);
		}
	});

	it('carries no credentials, instance metadata or pinned data', () => {
		expect(Object.keys(workflow)).not.toEqual(expect.arrayContaining(['meta']));
		expect(workflow).not.toHaveProperty('pinData');
		expect(workflow).not.toHaveProperty('id');
		for (const node of workflow.nodes) {
			expect(node, node.name).not.toHaveProperty('credentials');
			expect(node, node.name).not.toHaveProperty('webhookId');
		}
	});
});
