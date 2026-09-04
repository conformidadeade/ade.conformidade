"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { AnalystEntry, CatalogEntry, GuidelineEntry } from "@/lib/api/types";

export function useClients() {
  return useQuery({ queryKey: ["clients"], queryFn: () => api.get<CatalogEntry[]>("/clients") });
}

export function useMediaChannels() {
  return useQuery({ queryKey: ["media-channels"], queryFn: () => api.get<CatalogEntry[]>("/media-channels") });
}

export function useAnalysts() {
  return useQuery({ queryKey: ["analysts"], queryFn: () => api.get<AnalystEntry[]>("/analysts") });
}

export function useGuidelines() {
  return useQuery({ queryKey: ["guidelines"], queryFn: () => api.get<GuidelineEntry[]>("/guidelines") });
}
