import { useCallback, useEffect, useState } from "react";
import { api, getApiErrorMessage } from "../api/axios";

interface ApiDataState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// Load a list resource, ignore stale responses after cleanup, and expose refresh/loading/error state.
export function useApiData<T>(
  path: string | null,
  token?: string,
  userId?: number,
): ApiDataState<T> {
  const [result, setResult] = useState<{
    requestKey: string;
    data: T[];
    error: string | null;
  }>({ requestKey: "", data: [], error: null });
  const [requestVersion, setRequestVersion] = useState(0);
  // Include the account and refresh counter so old data is not shown for a new request.
  const requestKey = path ? JSON.stringify([path, userId, requestVersion]) : "";

  const refresh = useCallback(() => {
    setRequestVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (!path) return;

    let isCurrent = true;

    const loadData = async () => {
      try {
        const response = await api.get<T[]>(
          path,
          token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
        );
        if (isCurrent) {
          setResult({ requestKey, data: response.data, error: null });
        }
      } catch (requestError: unknown) {
        if (!isCurrent) return;
        const message = getApiErrorMessage(requestError, "Unable to load data.");
        setResult({ requestKey, data: [], error: message });
        console.error(`Failed to load ${path}:`, requestError);
      }
    };

    void loadData();

    return () => {
      isCurrent = false;
    };
  }, [path, requestKey, token, userId]);

  const hasCurrentResult = result.requestKey === requestKey;
  return {
    data: hasCurrentResult ? result.data : [],
    loading: Boolean(path) && !hasCurrentResult,
    error: hasCurrentResult ? result.error : null,
    refresh,
  };
}
