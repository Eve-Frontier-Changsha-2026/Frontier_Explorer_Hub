import { API_BASE_URL } from "./constants";
import type { AggregatedCell, IntelReport, BountyRequest, SubscriptionStatus } from "@/types";

let jwtToken: string | null = null;

export function setJwt(jwt: string | null) {
  jwtToken = jwt;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {})
  };
  if (jwtToken) headers.Authorization = `Bearer ${jwtToken}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText, body);
  }
  return res.json();
}

export function getHeatmap(zoomLevel: number, regionId?: number) {
  const params = new URLSearchParams();
  if (regionId != null) params.set("region", String(regionId));
  const qs = params.toString();
  return apiFetch<{ cells: AggregatedCell[]; tier: string }>(`/api/heatmap/${zoomLevel}${qs ? `?${qs}` : ""}`);
}

export function getIntel(intelId: string) {
  return apiFetch<{ intel: IntelReport; locked: boolean }>(`/api/intel/${intelId}`);
}

export function getRegionSummary(regionId: number) {
  return apiFetch<{
    regionId: number;
    totalReports: number;
    byType: Record<number, number>;
    activeBounties: number;
  }>(`/api/region/${regionId}/summary`);
}

export function getSubscriptionStatus() {
  return apiFetch<SubscriptionStatus>("/api/subscription/status");
}

export function getActiveBounties() {
  return apiFetch<{ bounties: BountyRequest[] }>("/api/bounties/active");
}
