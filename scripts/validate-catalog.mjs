#!/usr/bin/env node
/*
 * Validates every Backstage catalog descriptor in the repo against the same
 * entity policies and kind schemas the catalog backend applies on ingestion.
 *
 * Usage: node scripts/validate-catalog.mjs [file ...]
 * With no arguments it finds catalog-info.yaml, catalog/*.yaml and
 * templates/<name>/template.yaml. Scaffolder skeleton files are skipped,
 * because they hold ${{ values.* }} placeholders, not real entities.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { parseAllDocuments } from 'yaml';
import {
  DefaultNamespaceEntityPolicy,
  EntityPolicies,
  FieldFormatEntityPolicy,
  NoForeignRootFieldsEntityPolicy,
  SchemaValidEntityPolicy,
  apiEntityV1alpha1Validator,
  componentEntityV1alpha1Validator,
  domainEntityV1alpha1Validator,
  groupEntityV1alpha1Validator,
  locationEntityV1alpha1Validator,
  resourceEntityV1alpha1Validator,
  systemEntityV1alpha1Validator,
  userEntityV1alpha1Validator,
} from '@backstage/catalog-model';
import { templateEntityV1beta3Validator } from '@backstage/plugin-scaffolder-common';

const root = process.cwd();
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.yarn',
  'dist',
  'dist-types',
  'skeleton',
]);

const policy = EntityPolicies.allOf([
  new DefaultNamespaceEntityPolicy(),
  new NoForeignRootFieldsEntityPolicy(),
  new FieldFormatEntityPolicy(),
  new SchemaValidEntityPolicy(),
]);

const kindValidators = [
  apiEntityV1alpha1Validator,
  componentEntityV1alpha1Validator,
  domainEntityV1alpha1Validator,
  groupEntityV1alpha1Validator,
  locationEntityV1alpha1Validator,
  resourceEntityV1alpha1Validator,
  systemEntityV1alpha1Validator,
  userEntityV1alpha1Validator,
  templateEntityV1beta3Validator,
];

function findDescriptors(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) found.push(...findDescriptors(path));
      continue;
    }
    const rel = relative(root, path).split('\\').join('/');
    if (
      name === 'catalog-info.yaml' ||
      /^catalog\/[^/]+\.ya?ml$/.test(rel) ||
      /^templates\/[^/]+\/template\.ya?ml$/.test(rel)
    ) {
      found.push(rel);
    }
  }
  return found.sort();
}

/*
 * The catalog's placeholder processor swaps { $text | $json | $yaml: target }
 * for the target's content before validation. Do the same with a stand-in
 * value, failing if a relative target file is missing. URL targets are
 * fetched at ingestion time and are not checked here.
 */
function resolvePlaceholders(value, file, problems) {
  if (Array.isArray(value))
    return value.map(v => resolvePlaceholders(v, file, problems));
  if (value === null || typeof value !== 'object') return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && ['$text', '$json', '$yaml'].includes(keys[0])) {
    const target = value[keys[0]];
    if (typeof target !== 'string') {
      problems.push(`${keys[0]} target must be a string`);
    } else if (
      !/^[a-z]+:\/\//i.test(target) &&
      !existsSync(join(dirname(file), target))
    ) {
      problems.push(`${keys[0]} target not found: ${target}`);
    }
    return keys[0] === '$text' ? '<resolved at ingestion>' : {};
  }
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      resolvePlaceholders(v, file, problems),
    ]),
  );
}

async function validateEntity(entity) {
  await policy.enforce(entity);
  for (const validator of kindValidators) {
    if (await validator.check(entity)) return;
  }
  throw new Error(
    `unknown apiVersion/kind: ${entity.apiVersion} ${entity.kind}`,
  );
}

const files =
  process.argv.length > 2 ? process.argv.slice(2) : findDescriptors(root);
const seen = new Map();
let errors = 0;
let entities = 0;

for (const file of files) {
  const docs = parseAllDocuments(readFileSync(file, 'utf8'));
  for (const [i, doc] of docs.entries()) {
    const where = docs.length > 1 ? `${file} (document ${i + 1})` : file;
    if (doc.errors.length) {
      errors++;
      console.error(`✗ ${where}: YAML error: ${doc.errors[0].message}`);
      continue;
    }
    const problems = [];
    const entity = resolvePlaceholders(doc.toJS(), file, problems);
    if (entity === null) continue; // empty document, e.g. a trailing ---
    entities++;
    try {
      if (problems.length) throw new Error(problems.join('; '));
      await validateEntity(entity);
      const ref = `${entity.kind}:${entity.metadata.namespace ?? 'default'}/${
        entity.metadata.name
      }`.toLowerCase();
      if (seen.has(ref))
        throw new Error(`duplicate entity ${ref}, also in ${seen.get(ref)}`);
      seen.set(ref, where);
      console.log(`✓ ${where}: ${entity.kind} ${entity.metadata.name}`);
    } catch (e) {
      errors++;
      console.error(`✗ ${where}: ${e.message}`);
    }
  }
}

console.log(
  `\n${entities} entities in ${files.length} files, ${errors} error(s)`,
);
process.exit(errors ? 1 : 0);
