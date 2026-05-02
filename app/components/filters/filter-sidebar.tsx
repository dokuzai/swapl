"use client";

import { useTransition, useMemo, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CITIES } from "@/lib/cities";
import { PROPERTY_TYPES, propertyLabel } from "@/lib/types";
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
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const activeCount =
    filters.cities.length +
    filters.propertyTypes.length +
    (filters.minSqm !== FILTER_DEFAULTS.minSqm ? 1 : 0) +
    (filters.minSleeps !== FILTER_DEFAULTS.minSleeps ? 1 : 0) +
    (filters.petsRequired ? 1 : 0) +
    (filters.wfhRequired ? 1 : 0) +
    (filters.stepFreeRequired ? 1 : 0) +
    (filters.mutualOnly ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0);

  const dirty = activeCount > 0;

  return (
    <aside
      className="surface-card overflow-hidden lg:p-7 lg:sticky lg:top-24 self-start"
      style={{ background: "var(--cream-2)" }}
    >
      <button
        type="button"
        className="lg:hidden w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
        onClick={() => setMobileOpen((v) => !v)}
        aria-expanded={mobileOpen}
        aria-controls="filter-sidebar-content"
      >
        <span className="flex items-baseline gap-2">
          <span className="font-display text-lg tracking-[-0.01em] font-medium">Filters</span>
          {activeCount > 0 ? (
            <span
              className="font-mono text-[10px] uppercase tracking-[.08em] px-2 py-0.5 rounded-full"
              style={{ background: "var(--pink)", color: "#fff" }}
            >
              {activeCount} active
            </span>
          ) : (
            <span className="text-xs" style={{ color: "var(--navy-3)" }}>
              {resultCount.toLocaleString()} matches
            </span>
          )}
        </span>
        <span
          aria-hidden
          className="font-mono text-xs transition-transform"
          style={{ color: "var(--navy-3)", transform: mobileOpen ? "rotate(180deg)" : "none" }}
        >
          ▾
        </span>
      </button>

      <div
        id="filter-sidebar-content"
        className={`${mobileOpen ? "block" : "hidden"} px-5 pb-5 lg:block lg:p-0`}
      >
      <div className="mb-5 hidden lg:flex items-baseline justify-between">
        <h2 className="font-display text-lg tracking-[-0.01em] font-medium">Filters</h2>
        {dirty ? (
          <button
            className="font-mono text-[10px] uppercase tracking-[.08em] underline"
            style={{ color: "var(--pink)" }}
            onClick={() => start(() => router.push(pathname))}
            disabled={pending}
          >
            Reset
          </button>
        ) : null}
      </div>

      {dirty ? (
        <div className="mb-5 lg:hidden flex justify-end">
          <button
            className="font-mono text-[10px] uppercase tracking-[.08em] underline"
            style={{ color: "var(--pink)" }}
            onClick={() => start(() => router.push(pathname))}
            disabled={pending}
          >
            Reset
          </button>
        </div>
      ) : null}

      <Group label="Destination city">
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

      <Group label="Property type">
        <div className="flex flex-wrap gap-1.5">
          {PROPERTY_TYPES.map((t) => {
            const on = filters.propertyTypes.includes(t);
            return (
              <Chip key={t} on={on} onClick={() => update({ propertyTypes: toggleArr(filters.propertyTypes, t) })}>
                {propertyLabel(t)}
              </Chip>
            );
          })}
        </div>
      </Group>

      <Group label={`Minimum size · ${filters.minSqm}m²`}>
        <input
          type="range"
          min={30}
          max={300}
          value={filters.minSqm}
          onChange={(e) => update({ minSqm: +e.target.value })}
          className="w-full"
        />
      </Group>

      <Group label={`Sleeps at least · ${filters.minSleeps}`}>
        <input
          type="range"
          min={1}
          max={8}
          value={filters.minSleeps}
          onChange={(e) => update({ minSleeps: +e.target.value })}
          className="w-full"
        />
      </Group>

      <Group label="Available between">
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

      <Group label="Must-haves">
        <ToggleRow label="Pet-friendly" on={filters.petsRequired} onChange={(v) => update({ petsRequired: v })} />
        <ToggleRow label="Work-from-home setup" on={filters.wfhRequired} onChange={(v) => update({ wfhRequired: v })} />
        <ToggleRow label="Step-free access" on={filters.stepFreeRequired} onChange={(v) => update({ stepFreeRequired: v })} />
        <ToggleRow
          label={
            <>
              Only <em>mutual</em> swaps
            </>
          }
          on={filters.mutualOnly}
          onChange={(v) => update({ mutualOnly: v })}
        />
      </Group>

      <p className="text-xs mt-2" style={{ color: "var(--navy-3)" }}>
        {pending ? "Updating…" : `${resultCount.toLocaleString()} matches`}
      </p>

      <div className="mt-5 lg:hidden flex justify-end">
        <button
          type="button"
          className="pill-primary"
          onClick={() => setMobileOpen(false)}
        >
          Show {resultCount.toLocaleString()} homes
        </button>
      </div>
      </div>
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
