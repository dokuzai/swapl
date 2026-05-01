// URL <-> filter object helpers, shared between server and client.

export type ListingFilters = {
  cities: string[];
  propertyTypes: string[];
  minSqm: number;
  minSleeps: number;
  petsRequired: boolean;
  wfhRequired: boolean;
  stepFreeRequired: boolean;
  mutualOnly: boolean;
  dateFrom: string | null;
  dateTo: string | null;
  sort: "match" | "newest" | "size_desc" | "size_asc";
  page: number;
};

const DEFAULTS: ListingFilters = {
  cities: [],
  propertyTypes: [],
  minSqm: 30,
  minSleeps: 1,
  petsRequired: false,
  wfhRequired: false,
  stepFreeRequired: false,
  mutualOnly: false,
  dateFrom: null,
  dateTo: null,
  sort: "match",
  page: 1,
};

export function parseFiltersFromSearchParams(sp: Record<string, string | string[] | undefined>): ListingFilters {
  function arr(k: string): string[] {
    const v = sp[k];
    if (!v) return [];
    if (Array.isArray(v)) return v.flatMap((s) => s.split(",").filter(Boolean));
    return v.split(",").filter(Boolean);
  }
  function str(k: string): string | null {
    const v = sp[k];
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
  }
  const sortRaw = str("sort");
  const sort: ListingFilters["sort"] =
    sortRaw === "newest" || sortRaw === "size_desc" || sortRaw === "size_asc" ? sortRaw : "match";

  return {
    cities: arr("city"),
    propertyTypes: arr("type").map((s) => s.toUpperCase()),
    minSqm: Number(str("minSqm") ?? DEFAULTS.minSqm),
    minSleeps: Number(str("minSleeps") ?? DEFAULTS.minSleeps),
    petsRequired: str("pets") === "1",
    wfhRequired: str("wfh") === "1",
    stepFreeRequired: str("stepFree") === "1",
    mutualOnly: str("mutual") === "1",
    dateFrom: str("from"),
    dateTo: str("to"),
    sort,
    page: Math.max(1, Number(str("page") ?? 1)),
  };
}

export function filtersToQuery(f: Partial<ListingFilters>): string {
  const params = new URLSearchParams();
  if (f.cities?.length) params.set("city", f.cities.join(","));
  if (f.propertyTypes?.length) params.set("type", f.propertyTypes.join(","));
  if (f.minSqm && f.minSqm !== DEFAULTS.minSqm) params.set("minSqm", String(f.minSqm));
  if (f.minSleeps && f.minSleeps !== DEFAULTS.minSleeps) params.set("minSleeps", String(f.minSleeps));
  if (f.petsRequired) params.set("pets", "1");
  if (f.wfhRequired) params.set("wfh", "1");
  if (f.stepFreeRequired) params.set("stepFree", "1");
  if (f.mutualOnly) params.set("mutual", "1");
  if (f.dateFrom) params.set("from", f.dateFrom);
  if (f.dateTo) params.set("to", f.dateTo);
  if (f.sort && f.sort !== "match") params.set("sort", f.sort);
  if (f.page && f.page > 1) params.set("page", String(f.page));
  return params.toString();
}

export const FILTER_DEFAULTS = DEFAULTS;
