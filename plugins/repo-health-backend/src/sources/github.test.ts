import { parseRepoUrl, repoLocationForEntity } from './github';

const entity = (annotations: Record<string, string>) => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'x', annotations },
});

describe('repo location', () => {
  it('uses github.com/project-slug', () => {
    expect(
      repoLocationForEntity(
        entity({ 'github.com/project-slug': 'demoncartel/bad-app-sample' }),
      ),
    ).toEqual({
      host: 'github.com',
      owner: 'demoncartel',
      repo: 'bad-app-sample',
      ref: undefined,
      path: '',
    });
  });

  it('takes ref and sub-path from a matching source-location', () => {
    expect(
      repoLocationForEntity(
        entity({
          'github.com/project-slug': 'o/mono',
          'backstage.io/source-location':
            'url:https://github.com/o/mono/tree/main/services/api/',
        }),
      ),
    ).toMatchObject({ ref: 'main', path: 'services/api' });
  });

  it('falls back to managed-by-location (catalog file directory)', () => {
    expect(
      repoLocationForEntity(
        entity({
          'backstage.io/managed-by-location':
            'url:https://github.com/o/r/blob/main/svc/catalog-info.yaml',
        }),
      ),
    ).toMatchObject({ owner: 'o', repo: 'r', ref: 'main', path: 'svc' });
  });

  it('returns undefined without annotations', () => {
    expect(repoLocationForEntity(entity({}))).toBeUndefined();
    expect(parseRepoUrl('not a url', { pathIsFile: false })).toBeUndefined();
  });
});
