"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type RecommendedEventsContextType = {
  recommendedIds: Set<string>;
  setRecommendedIds: (ids: string[]) => void;
};

const RecommendedEventsContext = createContext<RecommendedEventsContextType>({
  recommendedIds: new Set(),
  setRecommendedIds: () => {},
});

export function RecommendedEventsProvider({ children }: { children: ReactNode }) {
  const [recommendedIds, setIds] = useState<Set<string>>(new Set());

  const setRecommendedIds = (ids: string[]) => {
    setIds(new Set(ids));
  };

  return (
    <RecommendedEventsContext.Provider value={{ recommendedIds, setRecommendedIds }}>
      {children}
    </RecommendedEventsContext.Provider>
  );
}

export function useRecommendedEvents() {
  return useContext(RecommendedEventsContext);
}
