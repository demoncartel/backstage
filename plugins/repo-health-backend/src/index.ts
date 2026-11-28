/**
 * Repo health backend plugin.
 *
 * @packageDocumentation
 */
export { repoHealthPlugin as default } from './plugin';
export {
  repoHealthCollectorsExtensionPoint,
  type RepoHealthCollectorsExtensionPoint,
} from './extensions';
export type {
  RepoCollector,
  RepoCollectorContext,
  RepoFiles,
} from './collectors/types';
