// This is a reusable custom hook for fetching lists of data from our API.
// Instead of writing useEffect + useState in every component that needs data,
// we centralize the logic here and just call useApiData("/products") or useApiData("/orders").
import { useCallback, useEffect, useState } from "react";
import { api, getApiErrorMessage } from "../api/axios";

// This interface describes what the hook returns to whoever calls it.
// T is a generic type — it gets filled in with Product, Order, etc. at call time.
interface ApiDataState<T> {
  data: T[];         // the fetched items
  loading: boolean;  // true while the request is in flight
  error: string | null; // error message if the request failed
  refresh: () => void;  // call this to re-fetch the data
}

// The hook accepts a path (like "/products"), an optional auth token, and an optional userId.
// Passing null as the path skips the request entirely — useful for orders when no one is logged in.
export function useApiData<T>(
  path: string | null,
  token?: string,
  userId?: number,
): ApiDataState<T> {
  // We store the result together with the key that produced it.
  // This way we can tell if the result on screen matches the current request.
  const [result, setResult] = useState<{
    requestKey: string;
    data: T[];
    error: string | null;
  }>({ requestKey: "", data: [], error: null });

  // A counter we increment every time refresh() is called.
  // This triggers the useEffect to re-run and fetch fresh data.
  const [requestVersion, setRequestVersion] = useState(0);

  // The request key combines the path, user ID, and refresh counter.
  // If any of those change, React sees a different key and knows to re-fetch.
  const requestKey = path ? JSON.stringify([path, userId, requestVersion]) : "";

  // useCallback keeps the same refresh function reference between renders.
  // Without this, components that depend on refresh() would re-render unnecessarily.
  const refresh = useCallback(() => {
    setRequestVersion((version) => version + 1); // bump the counter to trigger a new fetch
  }, []);

  useEffect(() => {
    // If no path was given, skip the fetch (e.g., orders when logged out)
    if (!path) return;

    // This flag lets us ignore the response if the component unmounted or the path changed.
    // Without it, a slow response could overwrite newer data.
    let isCurrent = true;

    const loadData = async () => {
      try {
        // Make the GET request, attaching the auth token in the header if we have one
        const response = await api.get<T[]>(
          path,
          token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
        );

        // Only update state if this response still belongs to the current request
        if (isCurrent) {
          setResult({ requestKey, data: response.data, error: null });
        }
      } catch (requestError: unknown) {
        // Ignore the error if the component already moved on to a different request
        if (!isCurrent) return;

        // Extract a readable message from the axios error and store it
        const message = getApiErrorMessage(requestError, "Unable to load data.");
        setResult({ requestKey, data: [], error: message });
        console.error(`Failed to load ${path}:`, requestError);
      }
    };

    void loadData(); // fire the async function (void tells linters we're intentionally ignoring the promise here)

    // Cleanup: mark this request as stale when the effect re-runs or the component unmounts
    return () => {
      isCurrent = false;
    };
  }, [path, requestKey, token, userId]); // re-run whenever any of these change

  // Check if the stored result matches the current request key
  const hasCurrentResult = result.requestKey === requestKey;

  return {
    // Return empty data if the result is stale (request in progress)
    data: hasCurrentResult ? result.data : [],
    // We're loading if there's a path but the result hasn't caught up yet
    loading: Boolean(path) && !hasCurrentResult,
    // Only surface the error if it came from the current request
    error: hasCurrentResult ? result.error : null,
    refresh,
  };
}
