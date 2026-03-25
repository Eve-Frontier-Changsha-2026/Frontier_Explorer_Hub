import { create } from "zustand";
import { persist } from "zustand/middleware";
import { validatePortalUrl } from "@/lib/portal-url";

export interface PortalLink {
  id: string;
  name: string;
  url: string;
  createdAt: number;
  order: number;
}

export interface PortalState {
  links: PortalLink[];
  addLink: (name: string, url: string) => string | null;
  removeLink: (id: string) => void;
  updateLink: (id: string, patch: Partial<Pick<PortalLink, "name" | "url">>) => boolean;
  reorderLinks: (ids: string[]) => void;
  getLinkById: (id: string) => PortalLink | undefined;
  findByUrl: (url: string) => PortalLink | undefined;
}

export const usePortalStore = create<PortalState>()(
  persist(
    (set, get) => ({
      links: [],

      addLink: (name, url) => {
        if (!validatePortalUrl(url).valid) return null;
        if (get().links.some((l) => l.url === url)) return null;
        const id = crypto.randomUUID();
        set((s) => ({
          links: [
            ...s.links,
            { id, name, url, createdAt: Date.now(), order: s.links.length },
          ],
        }));
        return id;
      },

      removeLink: (id) =>
        set((s) => ({
          links: s.links
            .filter((l) => l.id !== id)
            .map((l, i) => ({ ...l, order: i })),
        })),

      updateLink: (id, patch) => {
        if (patch.url && !validatePortalUrl(patch.url).valid) return false;
        if (!get().links.some((l) => l.id === id)) return false;
        set((s) => ({
          links: s.links.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        }));
        return true;
      },

      reorderLinks: (ids) =>
        set((s) => {
          const byId = new Map(s.links.map((l) => [l.id, l]));
          const reordered: PortalLink[] = [];
          for (const id of ids) {
            const link = byId.get(id);
            if (link) reordered.push({ ...link, order: reordered.length });
          }
          // append any links not in ids array (safety)
          for (const link of s.links) {
            if (!ids.includes(link.id)) reordered.push({ ...link, order: reordered.length });
          }
          return { links: reordered };
        }),

      getLinkById: (id) => get().links.find((l) => l.id === id),
      findByUrl: (url) => get().links.find((l) => l.url === url),
    }),
    { name: "feh-portal-links" }
  )
);
