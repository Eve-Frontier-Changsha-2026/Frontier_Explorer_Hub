import { API_BASE_URL } from "./constants";
import type { AggregatedCell, IntelReport, BountyRequest, BountyDetail, SubscriptionStatus, IntelListing, MarketReceipt, SellerReputation, RegionSummary, CharacterInfo } from "@/types";

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
  return apiFetch<RegionSummary>(`/api/region/${regionId}/summary`);
}

export function getCharacter(address: string) {
  return apiFetch<CharacterInfo>(`/api/character/${address}`);
}

export function getSubscriptionStatus() {
  return apiFetch<SubscriptionStatus>("/api/subscription/status");
}

export function getActiveBounties() {
  return apiFetch<{ bounties: BountyRequest[] }>("/api/bounties/active");
}

export function getBountyDetail(bountyId: string) {
  return apiFetch<{ bounty: BountyDetail }>(`/api/bounties/${bountyId}`);
}

export function getBountiesByCreator(address: string) {
  return apiFetch<{ bounties: BountyRequest[] }>(`/api/bounties/by-creator/${address}`);
}

export function getBountiesByHunter(address: string) {
  return apiFetch<{ bounties: BountyRequest[] }>(`/api/bounties/by-hunter/${address}`);
}

export function getMarketListings(params?: {
  region?: number;
  type?: number;
  sort?: string;
}): Promise<{ listings: IntelListing[] }> {
  const query = new URLSearchParams();
  if (params?.region != null) query.set("region", String(params.region));
  if (params?.type != null) query.set("type", String(params.type));
  if (params?.sort) query.set("sort", params.sort);
  const qs = query.toString();
  return apiFetch(`/api/market/listings${qs ? `?${qs}` : ""}`);
}

export function getMarketListing(id: string): Promise<{ listing: IntelListing; reputation: SellerReputation }> {
  return apiFetch(`/api/market/listings/${id}`);
}

export function getMyPurchases(): Promise<{ purchases: MarketReceipt[] }> {
  return apiFetch("/api/market/purchases");
}

export function getMySales(): Promise<{ listings: IntelListing[] }> {
  return apiFetch("/api/market/sales");
}

export function getReputation(address: string): Promise<SellerReputation> {
  return apiFetch(`/api/reputation/${address}`);
}
