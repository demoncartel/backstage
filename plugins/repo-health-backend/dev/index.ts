import { createBackend } from '@backstage/backend-defaults';
import { mockServices } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';

// Standalone dev backend: `yarn start` in this package, then
//   curl -X POST localhost:7007/api/repo-health/scan -H 'Content-Type: application/json' \
//     -d '{"entityRef":"component:default/legacy-orders-api"}'
// Needs GITHUB_TOKEN in the environment (integrations.github in app-config).
const backend = createBackend();
backend.add(mockServices.auth.factory());
backend.add(mockServices.httpAuth.factory());
backend.add(
  catalogServiceMock.factory({
    entities: [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'legacy-orders-api',
          annotations: {
            'github.com/project-slug': 'demoncartel/bad-app-sample',
          },
        },
        spec: { type: 'service', owner: 'platform' },
      },
    ],
  }),
);
backend.add(import('../src'));
backend.start();
