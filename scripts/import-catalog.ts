import { readFileSync, writeFileSync } from 'node:fs';
import { assertValidCatalog } from '../src/data/validateCatalog.ts';
const path = process.argv[2];
if (!path)
    throw new Error('Usage: pnpm catalog:import /absolute/path/verified-places.json');
const input = JSON.parse(readFileSync(path, 'utf8'));
assertValidCatalog(input);
writeFileSync('src/data/importedCatalog.ts', `import type { Place } from './types.ts';\nexport const importedPlaces = ${JSON.stringify(input, null, 2)} as const satisfies readonly Place[];\n`);
console.log(`Validated ${input.length} places. To activate, change src/data/index.ts to import importedPlaces and pass it to createLocalPlaceService. This deliberate source change keeps imports reviewable.`);
