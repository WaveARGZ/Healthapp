"use client";

import { useEffect, useState } from "react";

/** A small client-side loader for data supplied by the persistence contract. */
export function useAsyncData<T>(load: () => Promise<T>, initialValue: T) {
  const [data, setData] = useState<T>(initialValue);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void load().then((result) => {
      if (active) setData(result);
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [load]);

  return { data, isLoading, setData };
}
