"use client";

import { useEffect, useId, useRef, useState } from "react";
import { suggestCities, findCity, type ExtendedCity } from "@/lib/cities-extended";

export function CityCombobox({
  value,
  onSelect,
  placeholder = "Type a city — e.g. Roma, Tokyo, Lisboa",
}: {
  value: string;
  onSelect: (city: ExtendedCity) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(0);
  const listId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close when clicking outside.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const suggestions: ExtendedCity[] = query.trim() ? suggestCities(query, 8) : [];
  const exact = findCity(query);
  const noMatch = query.trim().length >= 2 && suggestions.length === 0 && !exact;

  function commit(city: ExtendedCity) {
    setQuery(city.name);
    setOpen(false);
    onSelect(city);
  }

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHover(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHover((h) => Math.min(suggestions.length - 1, h + 1));
            setOpen(true);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHover((h) => Math.max(0, h - 1));
          } else if (e.key === "Enter" && open && suggestions[hover]) {
            e.preventDefault();
            commit(suggestions[hover]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className="w-full px-3 py-2.5 rounded-lg border outline-none"
        style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
      />

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto surface-card p-1"
          style={{ background: "var(--card-bg)" }}
        >
          {suggestions.map((c, i) => (
            <li
              key={c.name}
              role="option"
              aria-selected={i === hover}
              onMouseEnter={() => setHover(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(c);
              }}
              className="px-3 py-2 rounded-md cursor-pointer text-sm flex items-center justify-between"
              style={{
                background: i === hover ? "var(--pink-light)" : "transparent",
                color: "var(--navy)",
              }}
            >
              <span className="font-medium">{c.name}</span>
              <span className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                {c.country}
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && noMatch && (
        <div
          className="absolute left-0 right-0 z-30 mt-1 px-3 py-2 surface-card text-sm"
          style={{ background: "var(--card-bg)", color: "var(--navy-2)" }}
        >
          We don&rsquo;t cover that city yet. Pick the closest match, or email us to add it.
        </div>
      )}
    </div>
  );
}
