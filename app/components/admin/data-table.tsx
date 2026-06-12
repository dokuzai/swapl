// Minimal server-rendered table for admin queues. Matches the surface-card
// look used across /admin (see verifications) — no client JS needed.
//
// Column filters (DOK-151): pass `filters` (one slot per column, null = no
// filter) plus `filterAction` (the page path) to render a discreet filter row
// under the headers. The controls belong to a plain GET <form> via the `form`
// attribute (so the form never wraps the table), values land in the
// querystring and the page filters server-side. Enter or the small "go"
// button submits; "clear" resets to the bare path.

import type { ReactNode } from "react";

export type ColumnFilter =
  | { type: "text"; name: string; placeholder?: string }
  | { type: "select"; name: string; options: Array<{ value: string; label: string }> }
  | null;

const filterControlStyle = {
  background: "var(--cream)",
  color: "var(--navy-2)",
  border: "1px solid color-mix(in oklab, var(--navy) 14%, transparent)",
} as const;

function FilterControl({
  filter,
  formId,
  values,
}: {
  filter: NonNullable<ColumnFilter>;
  formId: string;
  values: Record<string, string>;
}) {
  const current = values[filter.name] ?? "";
  if (filter.type === "text") {
    return (
      <input
        form={formId}
        type="text"
        name={filter.name}
        defaultValue={current}
        placeholder={filter.placeholder ?? "filter…"}
        className="w-full min-w-[90px] max-w-[180px] rounded-md px-2 py-1 font-mono text-[11px] outline-none focus:border-[var(--pink)]"
        style={filterControlStyle}
      />
    );
  }
  return (
    <select
      form={formId}
      name={filter.name}
      defaultValue={current}
      className="w-full min-w-[80px] max-w-[150px] rounded-md px-1.5 py-1 font-mono text-[11px] outline-none focus:border-[var(--pink)]"
      style={filterControlStyle}
    >
      <option value="">all</option>
      {filter.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function AdminTable({
  headers,
  rows,
  emptyLabel = "Nothing yet.",
  filters,
  filterAction,
  filterValues = {},
  preservedParams = {},
}: {
  headers: string[];
  rows: ReactNode[][];
  emptyLabel?: string;
  /** One entry per column; null for columns without a filter. */
  filters?: ColumnFilter[];
  /** Page path the GET form submits to, e.g. "/admin/users". Required with `filters`. */
  filterAction?: string;
  /** Current querystring values, used as defaultValue so filters persist. */
  filterValues?: Record<string, string>;
  /** Extra querystring params to keep on submit (rendered as hidden inputs). */
  preservedParams?: Record<string, string>;
}) {
  const hasFilters = Boolean(filters && filterAction);
  const formId = hasFilters
    ? `admin-filters-${filterAction!.replace(/\W+/g, "-")}`
    : undefined;
  const filtersActive =
    hasFilters && filters!.some((f) => f && (filterValues[f.name] ?? "") !== "");

  if (rows.length === 0 && !hasFilters) {
    return (
      <div className="surface-card p-6 text-sm" style={{ color: "var(--navy-2)" }}>
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="surface-card overflow-x-auto">
      {hasFilters ? (
        <form id={formId} method="get" action={filterAction}>
          {Object.entries(preservedParams).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        </form>
      ) : null}
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid color-mix(in oklab, var(--navy) 12%, transparent)" }}>
            {headers.map((h) => (
              <th
                key={h}
                className="px-3 py-3 text-left font-mono text-[10px] uppercase tracking-[.1em] font-normal whitespace-nowrap"
                style={{ color: "var(--navy-3)" }}
              >
                {h}
              </th>
            ))}
          </tr>
          {hasFilters ? (
            <tr
              style={{
                background: "color-mix(in oklab, var(--cream-2) 55%, transparent)",
                borderBottom: "1px solid color-mix(in oklab, var(--navy) 10%, transparent)",
              }}
            >
              {filters!.map((f, i) => {
                const isLast = i === filters!.length - 1;
                return (
                  <td key={i} className="px-3 py-2 align-middle">
                    <div className="flex items-center gap-2">
                      {f ? (
                        <FilterControl filter={f} formId={formId!} values={filterValues} />
                      ) : null}
                      {isLast ? (
                        <span className="ml-auto flex items-center gap-2 whitespace-nowrap">
                          <button
                            form={formId}
                            type="submit"
                            className="font-mono text-[10px] uppercase tracking-[.08em] px-2.5 py-1 rounded-full cursor-pointer"
                            style={{ background: "var(--navy)", color: "var(--cream)" }}
                          >
                            go
                          </button>
                          {filtersActive ? (
                            <a
                              href={filterAction}
                              className="font-mono text-[10px] uppercase tracking-[.08em] hover:underline"
                              style={{ color: "var(--pink)" }}
                            >
                              clear
                            </a>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          ) : null}
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={headers.length}
                className="px-3 py-6 text-sm"
                style={{ color: "var(--navy-2)" }}
              >
                {emptyLabel}
              </td>
            </tr>
          ) : null}
          {rows.map((cells, i) => (
            <tr
              key={i}
              style={{ borderBottom: "1px solid color-mix(in oklab, var(--navy) 6%, transparent)" }}
            >
              {cells.map((c, j) => (
                <td key={j} className="px-3 py-3 align-top whitespace-nowrap">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusPill({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-[.08em] px-2 py-0.5 rounded-full"
      style={
        accent
          ? { background: "var(--pink)", color: "#fff" }
          : { background: "var(--cream-2)", color: "var(--navy-2)" }
      }
    >
      {label}
    </span>
  );
}

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}
