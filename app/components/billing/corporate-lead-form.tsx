"use client";

import { useState, useTransition } from "react";

export function CorporateLeadForm() {
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    employeeCount: "",
    useCase: "",
  });
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [pending, start] = useTransition();

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm({ ...form, [k]: v });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("idle");
    start(async () => {
      const res = await fetch("/api/corporate/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          employeeCount: form.employeeCount ? Number(form.employeeCount) : undefined,
        }),
      });
      setStatus(res.ok ? "ok" : "error");
    });
  }

  if (status === "ok") {
    return (
      <div className="surface-card p-6 text-sm" style={{ color: "var(--navy-2)" }}>
        Thanks. A team member will reach out within one working day.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="surface-card p-6 space-y-3">
      {(
        [
          ["companyName", "Company name", "text", true],
          ["contactName", "Your name", "text", true],
          ["email", "Work email", "email", true],
          ["phone", "Phone (optional)", "tel", false],
          ["employeeCount", "Employee count", "number", false],
        ] as const
      ).map(([k, label, type, required]) => (
        <label key={k} className="block text-sm">
          <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
            {label}
          </span>
          <input
            type={type}
            required={required}
            value={form[k]}
            onChange={(e) => set(k, e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border outline-none"
            style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
          />
        </label>
      ))}
      <label className="block text-sm">
        <span className="block mb-1.5 font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--navy-3)" }}>
          What's the primary use case?
        </span>
        <textarea
          value={form.useCase}
          onChange={(e) => set("useCase", e.target.value)}
          rows={3}
          className="w-full px-3 py-2.5 rounded-lg border outline-none"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
        />
      </label>
      {status === "error" && <p className="text-sm" style={{ color: "#dc2626" }}>Couldn't send. Try again.</p>}
      <button type="submit" disabled={pending} className="pill-primary w-full justify-center">
        {pending ? "Sending…" : "Request a demo"}
      </button>
    </form>
  );
}
