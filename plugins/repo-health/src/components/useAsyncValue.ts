import { DependencyList, useCallback, useEffect, useState } from 'react';

/** Tiny async-state hook (avoids an extra dependency). */
export function useAsyncValue<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<{
    loading: boolean;
    value?: T;
    error?: Error;
  }>({
    loading: true,
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const load = useCallback(() => {
    let cancelled = false;
    setState(s => ({ ...s, loading: true }));
    run().then(
      value => !cancelled && setState({ loading: false, value }),
      error => !cancelled && setState({ loading: false, error }),
    );
    return () => {
      cancelled = true;
    };
  }, [run]);
  useEffect(() => load(), [load]);
  return { ...state, reload: load };
}
