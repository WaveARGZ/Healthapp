"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bodyMakeClient } from "@/lib/api/client";
import { compareWeightEntriesNewest, isBodyWeightKg } from "@/lib/utils/current-weight";
import { toDateInputValue } from "@/lib/utils/date";
import type { WeightEntry } from "@/types/progress";

interface WeightHistory {
  entries: WeightEntry[];
  startingWeightKg?: number;
  today: string;
  loading: boolean;
  weightsUnavailable: boolean;
  profileUnavailable: boolean;
}

export function useWeightHistory() {
  const [history, setHistory] = useState<WeightHistory>(() => ({
    entries: [], today: toDateInputValue(), loading: true, weightsUnavailable: false, profileUnavailable: false,
  }));
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    const [profile, weights] = await Promise.allSettled([bodyMakeClient.getProfile(), bodyMakeClient.getWeightEntries()]);
    if (request.current !== id) return;
    const initial = profile.status === "fulfilled" ? profile.value?.startingWeightKg : undefined;
    const today = toDateInputValue();
    setHistory((current) => ({
      entries: weights.status === "fulfilled" ? [...weights.value].sort(compareWeightEntriesNewest) : current.entries,
      startingWeightKg: profile.status === "rejected" ? current.startingWeightKg : isBodyWeightKg(initial) ? initial : undefined,
      today,
      loading: false,
      weightsUnavailable: weights.status === "rejected",
      profileUnavailable: profile.status === "rejected",
    }));
  }, []);

  useEffect(() => {
    let refreshing = false;
    function refreshVisible() {
      if (document.visibilityState !== "visible" || refreshing) return;
      refreshing = true;
      void refresh().finally(() => { refreshing = false; });
    }
    if (document.visibilityState === "visible") refreshVisible();
    else void refresh();
    window.addEventListener("focus", refreshVisible);
    window.addEventListener("pageshow", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      request.current += 1;
      window.removeEventListener("focus", refreshVisible);
      window.removeEventListener("pageshow", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refresh]);

  return { ...history, refresh };
}
