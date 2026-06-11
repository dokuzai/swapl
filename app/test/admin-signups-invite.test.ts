// POST /api/admin/signups/invite — admin gating, batch selection (oldest
// uninvited+unregistered first), invitedAt stamping, limit clamping and the
// { ok, invited, remaining } reply shape.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  count: vi.fn(),
  sendEmail: vi.fn(),
  betaInvite: vi.fn(),
}));

vi.mock("@/lib/auth/abilities", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({
  prisma: {
    betaSignup: {
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
      count: mocks.count,
    },
  },
}));
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  emailTemplates: { betaInvite: mocks.betaInvite },
}));

import { POST } from "@/app/api/admin/signups/invite/route";

function req(body?: unknown) {
  return new Request("http://test/api/admin/signups/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "swapl_admin" });
  mocks.findMany.mockResolvedValue([]);
  mocks.updateMany.mockResolvedValue({ count: 0 });
  mocks.count.mockResolvedValue(0);
  mocks.sendEmail.mockResolvedValue(undefined);
  mocks.betaInvite.mockImplementation((email: string) => ({ to: email }));
});

describe("POST /api/admin/signups/invite", () => {
  it("returns 403 for non-admins and never touches the DB", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await POST(req({}));
    expect(res.status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("selects only uninvited, unregistered signups — oldest first, default limit 50", async () => {
    await POST(req({}));
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { userId: null, invitedAt: null },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
  });

  it("clamps the limit to 200 and floors fractional values", async () => {
    await POST(req({ limit: 9999 }));
    expect(mocks.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 200 })
    );
    await POST(req({ limit: 7.9 }));
    expect(mocks.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 7 })
    );
  });

  it("falls back to the default for invalid limits and malformed bodies", async () => {
    for (const body of [{ limit: 0 }, { limit: -3 }, { limit: "ten" }, undefined]) {
      await POST(req(body));
      expect(mocks.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 50 })
      );
    }
  });

  it("sends an invite per row, stamps invitedAt, and reports counts", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "s1", email: "a@example.com" },
      { id: "s2", email: "b@example.com" },
    ]);
    mocks.count.mockResolvedValue(3);

    const res = await POST(req({ limit: 2 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, invited: 2, remaining: 3 });

    expect(mocks.betaInvite).toHaveBeenCalledWith("a@example.com");
    expect(mocks.betaInvite).toHaveBeenCalledWith("b@example.com");
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["s1", "s2"] } },
      data: { invitedAt: expect.any(Date) },
    });
  });

  it("skips already-invited/registered rows by construction (empty batch -> no writes, no sends)", async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);

    const res = await POST(req({}));
    expect(await res.json()).toEqual({ ok: true, invited: 0, remaining: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("still stamps invitedAt when a send rejects (best-effort transport)", async () => {
    mocks.findMany.mockResolvedValue([{ id: "s1", email: "a@example.com" }]);
    mocks.sendEmail.mockRejectedValue(new Error("resend down"));
    mocks.count.mockResolvedValue(0);

    const res = await POST(req({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, invited: 1, remaining: 0 });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["s1"] } } })
    );
  });
});
