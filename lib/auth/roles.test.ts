import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUser, getUserRole } from "@/lib/auth/roles";

type MockClient = {
  auth: { getUser: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
};

function mockClient(
  user: { id: string } | null,
  adminRow: unknown,
  volunteerRow: unknown,
): MockClient {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: table === "admins" ? adminRow : volunteerRow,
        error: null,
      }),
    })),
  };
}

describe("getUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when unauthenticated", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(mockClient(null, null, null) as never);
    expect(await getUser()).toBeNull();
  });

  it("returns user when authenticated", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      mockClient({ id: "u1" }, null, null) as never,
    );
    expect(await getUser()).toEqual({ id: "u1" });
  });
});

describe("getUserRole", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 'guest' when unauthenticated", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(mockClient(null, null, null) as never);
    expect(await getUserRole()).toEqual({ role: "guest" });
  });

  it("returns 'admin' when admin row exists", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      mockClient({ id: "u1" }, { id: "u1" }, null) as never,
    );
    expect(await getUserRole()).toEqual({ role: "admin", userId: "u1" });
  });

  it("returns 'volunteer' with status when volunteer row exists", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      mockClient({ id: "u2" }, null, { id: "u2", status: "pending" }) as never,
    );
    expect(await getUserRole()).toEqual({
      role: "volunteer",
      userId: "u2",
      status: "pending",
    });
  });

  it("returns 'incomplete' when authed but no admin/volunteer row", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      mockClient({ id: "u3" }, null, null) as never,
    );
    expect(await getUserRole()).toEqual({ role: "incomplete", userId: "u3" });
  });
});
