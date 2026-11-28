import {
  ApiBlueprint,
  createFrontendPlugin,
  createRouteRef,
  discoveryApiRef,
  fetchApiRef,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { EntityCardBlueprint } from '@backstage/plugin-catalog-react/alpha';
import HealingIcon from '@material-ui/icons/Healing';
import { RepoHealthClient, repoHealthApiRef } from './api';

export const rootRouteRef = createRouteRef();

const repoHealthApi = ApiBlueprint.make({
  params: defineParams =>
    defineParams({
      api: repoHealthApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: deps => new RepoHealthClient(deps),
    }),
});

/** Estate page, shown in the sidebar as "Repo Health". */
const repoHealthPage = PageBlueprint.make({
  params: {
    path: '/repo-health',
    routeRef: rootRouteRef,
    title: 'Repo Health',
    icon: <HealingIcon />,
    noHeader: true,
    loader: () =>
      import('./components/RepoHealthPage').then(m => <m.RepoHealthPage />),
  },
});

/** Card on the overview tab of every Component. */
const repoHealthEntityCard = EntityCardBlueprint.make({
  name: 'repo-health',
  params: {
    filter: 'kind:component',
    loader: () =>
      import('./components/RepoHealthCard').then(m => <m.RepoHealthCard />),
  },
});

export const repoHealthPlugin = createFrontendPlugin({
  pluginId: 'repo-health',
  title: 'Repo Health',
  icon: <HealingIcon />,
  info: { packageJson: () => import('../package.json') },
  extensions: [repoHealthApi, repoHealthPage, repoHealthEntityCard],
  routes: { root: rootRouteRef },
});
