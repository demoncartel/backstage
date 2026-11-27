import {
  createFrontendModule,
  githubAuthApiRef,
} from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';

/**
 * Sign-in page offering GitHub (for members of the configured org) and Guest.
 * Replaces the default guest-only page. GitHub sign-in needs the OAuth App
 * credentials in .env and the org import to have run (see README.md).
 */
const signInPage = SignInPageBlueprint.make({
  params: {
    loader: async () => {
      const { SignInPage } = await import('@backstage/core-components');
      return props => (
        <SignInPage
          {...props}
          providers={[
            {
              id: 'github-auth-provider',
              title: 'GitHub',
              message:
                'Sign in with your GitHub account (organization members)',
              apiRef: githubAuthApiRef,
            },
            'guest',
          ]}
        />
      );
    },
  },
});

export const signInModule = createFrontendModule({
  pluginId: 'app',
  extensions: [signInPage],
});
