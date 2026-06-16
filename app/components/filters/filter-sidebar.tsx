"use client";

import { useTransition, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CITIES } from "@/lib/cities";
import { PROPERTY_TYPES, propertyTypeKey } from "@/lib/types";
import { useT } from "@/lib/i18n/client";
import {
  parseFiltersFromSearchParams,
  filtersToQuery,
  FILTER_DEFAULTS,
  type ListingFilters,
} from "@/lib/listing-filters";

export function FilterSidebar({ resultCount }: { resultCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const t = useT();

  const filters = useMemo<ListingFilters>(() => {
    const obj: Record<string, string> = {};
    sp.forEach((v, k) => (obj[k] = v));
    return parseFiltersFromSearchParams(obj);
  }, [sp]);

  function update(patch: Partial<ListingFilters>) {
    const merged: ListingFilters = { ...filters, ...patch, page: 1 };
    const qs = filtersToQuery(merged);
    start(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  function toggleArr(arr: string[], v: string) {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  const dirty =
    filters.cities.length ||
    filters.propertyTypes.length ||
    filters.minSqm !== FILTER_DEFAULTS.minSqm ||
    filters.minSleeps !== FILTER_DEFAULTS.minSleeps ||
    filters.petsRequired ||
    filters.wfhRequired ||
    filters.stepFreeRequired ||
    filters.mutualOnly ||
    filters.spaceType ||
    filters.dateFrom ||
    filters.dateTo;

  return (
    <aside
      id="browse-filters"
      className="surface-card overflow-hidden p-7 scroll-mt-28 lg:sticky lg:top-24 lg:self-start"
      style={{ background: "var(--cream-2)" }}
    >
      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="font-display text-lg tracking-[-0.01em] font-medium">{t("filter.heading")}</h2>
        {dirty ? (
          <button
            className="font-mono text-[10px] uppercase tracking-[.08em] underline"
            style={{ color: "var(--pink)" }}
            onClick={() => start(() => router.push(pathname))}
            disabled={pending}
          >
            {t("filter.reset")}
          </button>
        ) : null}
      </div>

      <Group label={t("filter.destinationCity")}>
        <div className="flex flex-wrap gap-1.5">
          {CITIES.map((c) => {
            const on = filters.cities.includes(c.name);
            return (
              <Chip key={c.name} on={on} onClick={() => update({ cities: toggleArr(filters.cities, c.name) })}>
                {c.name}
              </Chip>
            );
          })}
        </div>
      </Group>

      <Group label={t("filter.propertyType")}>
        <div className="flex flex-wrap gap-1.5">
          {PROPERTY_TYPES.map((pt) => {
            const on = filters.propertyTypes.includes(pt);
            return (
              <Chip key={pt} on={on} onClick={() => update({ propertyTypes: toggleArr(filters.propertyTypes, pt) })}>
                {t(propertyTypeKey(pt))}
              </Chip>
            );
          })}
        </div>
      </Group>

      <Group label={t("filter.spaceType")}>
        <div className="flex flex-wrap gap-1.5">
          <Chip on={filters.spaceType === null} onClick={() => update({ spaceType: null })}>
            {t("filter.spaceTypeAll")}
          </Chip>
          <Chip on={filters.spaceType === "entire_place"} onClick={() => update({ spaceType: "entire_place" })}>
            {t("spaceType.entirePlace")}
          </Chip>
          <Chip on={filters.spaceType === "private_room"} onClick={() => update({ spaceType: "private_room" })}>
            {t("spaceType.privateRoom")}
          </Chip>
        </div>
      </Group>

      <Group label={t("filter.minSizeVal", { size: filters.minSqm })}>
        <input
          type="range"
          min={30}
          max={300}
          value={filters.minSqm}
          onChange={(e) => update({ minSqm: +e.target.value })}
          className="w-full"
        />
      </Group>

      <Group label={t("filter.sleepsAtLeastVal", { count: filters.minSleeps })}>
        <input
          type="range"
          min={1}
          max={8}
          value={filters.minSleeps}
          onChange={(e) => update({ minSleeps: +e.target.value })}
          className="w-full"
        />
      </Group>

      <Group label={t("filter.availableBetween")}>
        <div className="flex gap-2">
          <input
            type="date"
            value={filters.dateFrom ?? ""}
            onChange={(e) => update({ dateFrom: e.target.value || null })}
            className="flex-1 px-2 py-1.5 rounded border text-sm"
            style={{ background: "var(--card-bg)", borderColor: "var(--line)" }}
          />
          <input
            type="date"
            value={filters.dateTo ?? ""}
            onChange={(e) => update({ dateTo: e.target.value || null })}
            className="flex-1 px-2 py-1.5 rounded border text-sm"
            style={{ background: "var(--card-bg)", borderColor: "var(--line)" }}
          />
        </div>
      </Group>

      <Group label={t("filter.mustHaves")}>
        <ToggleRow label={t("filter.petFriendly")} on={filters.petsRequired} onChange={(v) => update({ petsRequired: v })} />
        <ToggleRow label={t("filter.wfh")} on={filters.wfhRequired} onChange={(v) => update({ wfhRequired: v })} />
        <ToggleRow label={t("filter.stepFree")} on={filters.stepFreeRequired} onChange={(v) => update({ stepFreeRequired: v })} />
        <ToggleRow
          label={
            <>
              {t("filter.mutualOnly")} <em>{t("filter.mutualEm")}</em> {t("filter.mutualSwaps")}
            </>
          }
          on={filters.mutualOnly}
          onChange={(v) => update({ mutualOnly: v })}
        />
      </Group>

      <p className="text-xs mt-2" style={{ color: "var(--navy-3)" }}>
        {pending ? t("filter.updating") : t("filter.matchesCount", { count: resultCount.toLocaleString() })}
      </p>
    </aside>
  );
}

function Group({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-6 last:mb-0">
      <label className="block font-mono text-[10px] uppercase tracking-[.12em] mb-3" style={{ color: "var(--navy-3)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs px-3 py-1.5 rounded-full border transition-all whitespace-nowrap"
      style={
        on
          ? { background: "var(--pink)", color: "#fff", borderColor: "var(--pink)" }
          : { background: "var(--card-bg)", color: "var(--navy-2)", borderColor: "var(--line)" }
      }
    >
      {children}
    </button>
  );
}

function ToggleRow({
  label,
  on,
  onChange,
}: {
  label: React.ReactNode;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm" style={{ borderTop: "1px solid var(--line)" }}>
      <span>{label}</span>
      <div
        role="switch"
        tabIndex={0}
        aria-checked={on}
        className="swapl-switch"
        data-on={on}
        onClick={() => onChange(!on)}
        onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onChange(!on)}
      />
    </div>
  );
}
