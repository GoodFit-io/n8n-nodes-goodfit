import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HOST = process.env.GOODFIT_API_HOST ?? 'https://api.goodfit.io';
const APIS = ['dataset', 'organisation', 'enrichment'];
const checkOnly = process.argv.includes('--check');

const documentPath = (api) => join('openapi', `${api}.json`);
const serialise = (document) => `${JSON.stringify(document, null, '\t')}\n`;

async function fetchDocument(api) {
	const response = await fetch(`${HOST}/${api}/openapi.json`);
	return response.ok ? serialise(await response.json()) : undefined;
}

function reconcile(api, published) {
	const path = documentPath(api);
	const committed = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
	if (published === undefined) {
		process.exitCode = 1;
		return `${api}: FAILED to fetch its published document from ${HOST}`;
	}
	if (published === committed) return `${api}: up to date`;
	if (checkOnly) {
		process.exitCode = 1;
		return `${api}: DRIFTED from ${HOST}. Run npm run openapi:sync and fix any failing contract tests`;
	}
	writeFileSync(path, published);
	return `${api}: updated`;
}

for (const api of APIS) console.log(reconcile(api, await fetchDocument(api)));
