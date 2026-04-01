/**
 * @vitest-environment node
 */

import { test, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

// Mock server-only module (can be empty since it's just a guard)
vi.mock("server-only", () => ({}));

// Mock next/headers
const mockCookieStore = {
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

// Mock jose
vi.mock("jose");

// Import after all mocks are set up
import * as jose from "jose";
import { createSession, getSession, deleteSession, verifySession } from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

test("createSession creates a token and sets httpOnly cookie", async () => {
  const mockToken = "mock-jwt-token";
  const mockSignJWT = vi.mocked(jose.SignJWT);

  // Setup mock JWT signing chain
  const mockSigner = {
    setProtectedHeader: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    setIssuedAt: vi.fn().mockReturnThis(),
    sign: vi.fn().mockResolvedValue(mockToken),
  };

  mockSignJWT.mockImplementation(() => mockSigner as any);

  await createSession("user-123", "test@example.com");

  // Verify JWT was created with correct payload
  expect(mockSignJWT).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: "user-123",
      email: "test@example.com",
    })
  );

  // Verify JWT configuration
  expect(mockSigner.setProtectedHeader).toHaveBeenCalledWith({ alg: "HS256" });
  expect(mockSigner.setExpirationTime).toHaveBeenCalledWith("7d");
  expect(mockSigner.setIssuedAt).toHaveBeenCalled();

  // Verify cookie was set
  expect(mockCookieStore.set).toHaveBeenCalledWith(
    "auth-token",
    mockToken,
    expect.objectContaining({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    })
  );
});

test("createSession sets secure cookie in production", async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const mockToken = "mock-jwt-token";
  const mockSignJWT = vi.mocked(jose.SignJWT);
  const mockSigner = {
    setProtectedHeader: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    setIssuedAt: vi.fn().mockReturnThis(),
    sign: vi.fn().mockResolvedValue(mockToken),
  };

  mockSignJWT.mockImplementation(() => mockSigner as any);

  await createSession("user-123", "test@example.com");

  expect(mockCookieStore.set).toHaveBeenCalledWith(
    "auth-token",
    mockToken,
    expect.objectContaining({
      secure: true,
    })
  );

  process.env.NODE_ENV = originalEnv;
});

test("createSession does not set secure cookie in development", async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  const mockToken = "mock-jwt-token";
  const mockSignJWT = vi.mocked(jose.SignJWT);
  const mockSigner = {
    setProtectedHeader: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    setIssuedAt: vi.fn().mockReturnThis(),
    sign: vi.fn().mockResolvedValue(mockToken),
  };

  mockSignJWT.mockImplementation(() => mockSigner as any);

  await createSession("user-123", "test@example.com");

  expect(mockCookieStore.set).toHaveBeenCalledWith(
    "auth-token",
    mockToken,
    expect.objectContaining({
      secure: false,
    })
  );

  process.env.NODE_ENV = originalEnv;
});

test("createSession sets cookie expiration to 7 days", async () => {
  const mockToken = "mock-jwt-token";
  const mockSignJWT = vi.mocked(jose.SignJWT);
  const mockSigner = {
    setProtectedHeader: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    setIssuedAt: vi.fn().mockReturnThis(),
    sign: vi.fn().mockResolvedValue(mockToken),
  };

  mockSignJWT.mockImplementation(() => mockSigner as any);

  const beforeTime = Date.now();
  await createSession("user-123", "test@example.com");
  const afterTime = Date.now();

  const callArgs = mockCookieStore.set.mock.calls[0];
  const cookieOptions = callArgs[2];
  const expiresAt = new Date(cookieOptions.expires).getTime();

  // Check expiration is approximately 7 days from now (within 1 second)
  const expectedExpiration = 7 * 24 * 60 * 60 * 1000;
  const actualExpiration = expiresAt - beforeTime;

  expect(Math.abs(actualExpiration - expectedExpiration)).toBeLessThan(2000);
});

test("getSession returns null when no token exists", async () => {
  mockCookieStore.get.mockReturnValue(undefined);

  const session = await getSession();

  expect(session).toBeNull();
  expect(mockCookieStore.get).toHaveBeenCalledWith("auth-token");
});

test("getSession returns session payload when token is valid", async () => {
  const mockPayload = {
    userId: "user-123",
    email: "test@example.com",
    expiresAt: new Date(),
  };

  mockCookieStore.get.mockReturnValue({ value: "valid-token" });

  const mockJwtVerify = vi.mocked(jose.jwtVerify);
  mockJwtVerify.mockResolvedValue({
    payload: mockPayload as any,
  } as any);

  const session = await getSession();

  expect(session).toEqual(mockPayload);
  expect(mockJwtVerify).toHaveBeenCalledWith("valid-token", expect.any(Uint8Array));
});

test("getSession returns null when token verification fails", async () => {
  mockCookieStore.get.mockReturnValue({ value: "invalid-token" });

  const mockJwtVerify = vi.mocked(jose.jwtVerify);
  mockJwtVerify.mockRejectedValue(new Error("Invalid token"));

  const session = await getSession();

  expect(session).toBeNull();
});

test("deleteSession removes the auth cookie", async () => {
  await deleteSession();

  expect(mockCookieStore.delete).toHaveBeenCalledWith("auth-token");
});

test("verifySession returns null when no token in request", async () => {
  const mockRequest = {
    cookies: {
      get: vi.fn().mockReturnValue(undefined),
    },
  } as unknown as NextRequest;

  const session = await verifySession(mockRequest);

  expect(session).toBeNull();
});

test("verifySession returns session payload when token is valid", async () => {
  const mockPayload = {
    userId: "user-123",
    email: "test@example.com",
    expiresAt: new Date(),
  };

  const mockRequest = {
    cookies: {
      get: vi.fn().mockReturnValue({ value: "valid-token" }),
    },
  } as unknown as NextRequest;

  const mockJwtVerify = vi.mocked(jose.jwtVerify);
  mockJwtVerify.mockResolvedValue({
    payload: mockPayload as any,
  } as any);

  const session = await verifySession(mockRequest);

  expect(session).toEqual(mockPayload);
});

test("verifySession returns null when token verification fails", async () => {
  const mockRequest = {
    cookies: {
      get: vi.fn().mockReturnValue({ value: "invalid-token" }),
    },
  } as unknown as NextRequest;

  const mockJwtVerify = vi.mocked(jose.jwtVerify);
  mockJwtVerify.mockRejectedValue(new Error("Invalid token"));

  const session = await verifySession(mockRequest);

  expect(session).toBeNull();
});
