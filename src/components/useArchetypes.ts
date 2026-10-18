"use client";

import { useMemo } from "react";
import { useSite } from "./SiteProvider";
import { kindFields, loadArchetype, referenceFields, type Archetype } from "@/lib/archetypes";

/** The blog's archetypes and what they tell us about its fields, derived from the loaded site. */
export function useArchetypes() {
  const { site } = useSite();
  return useMemo(() => {
    const all = (site?.archetypes ?? []).map((a) => loadArchetype(a));
    const archetypes = all.filter((a) => !a.error);
    const entries = (site?.entries ?? []).map((e) => ({ ...e, isIndex: e.path.endsWith("/_index.md") }));
    return {
      archetypes,
      broken: all.filter((a) => a.error),
      byName: (name: string | null | undefined): Archetype | null => archetypes.find((a) => a.name === name) ?? null,
      kinds: kindFields(archetypes),
      refs: referenceFields(archetypes, entries),
    };
  }, [site]);
}
