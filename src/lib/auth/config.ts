import type { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isLocale } from "@/lib/i18n/dictionaries";

export const JWT_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface JwtUserSnapshot {
  id: string;
  role: Role;
  locale: string;
  isActive: boolean;
  name?: string | null;
  email?: string | null;
}

export interface RefreshableJwtToken {
  sub?: string;
  role?: Role;
  locale?: "en" | "ar";
  isActive?: boolean;
  refreshedAt?: number;
  name?: string | null;
  email?: string | null;
  [key: string]: unknown;
}

/**
 * Pure helper for Google account linking safety:
 * Only allows linking/creating an account when Google explicitly asserts `email_verified === true`.
 */
export function isVerifiedGoogleSignIn(
  provider: string | undefined,
  email: string | null | undefined,
  profile: Record<string, unknown> | undefined,
): boolean {
  if (provider !== "google") return true;
  if (!email?.trim()) return false;
  return profile?.email_verified === true;
}

/**
 * Re-validates role and active status from the database when a JWT is older than 5 minutes.
 * Returns `null` if the user has been deactivated or deleted, invalidating the session.
 */
export async function refreshJwtTokenClaims<T extends RefreshableJwtToken>(params: {
  token: T;
  initialUser?: {
    id?: string;
    role?: Role;
    locale?: "en" | "ar";
    isActive?: boolean;
  };
  loadUserById: (id: string) => Promise<JwtUserSnapshot | null>;
  nowMs?: number;
}): Promise<T | null> {
  const { token, initialUser, loadUserById, nowMs = Date.now() } = params;

  if (initialUser?.id) {
    if (initialUser.isActive === false) {
      return null;
    }
    token.sub = initialUser.id;
    token.role = initialUser.role ?? "DINER";
    token.locale = initialUser.locale ?? "en";
    token.isActive = true;
    token.refreshedAt = nowMs;
    return token;
  }

  if (!token.sub || token.isActive === false) {
    return null;
  }

  const lastRefreshed = typeof token.refreshedAt === "number" ? token.refreshedAt : 0;
  if (nowMs - lastRefreshed < JWT_REFRESH_INTERVAL_MS) {
    return token;
  }

  const dbUser = await loadUserById(token.sub);
  if (!dbUser || !dbUser.isActive) {
    return null;
  }

  token.role = dbUser.role;
  token.locale = isLocale(dbUser.locale) ? dbUser.locale : "en";
  token.isActive = true;
  token.refreshedAt = nowMs;
  if (dbUser.name) token.name = dbUser.name;
  if (dbUser.email) token.email = dbUser.email;
  return token;
}

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Email & Password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(rawCredentials) {
      const parsed = credentialsSchema.safeParse(rawCredentials);
      if (!parsed.success) {
        return null;
      }

      const email = parsed.data.email.toLowerCase();
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user || !user.isActive || !user.passwordHash) {
        return null;
      }

      const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!valid) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        locale: isLocale(user.locale) ? user.locale : "en",
        isActive: true,
      };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID.trim(),
      clientSecret: process.env.GOOGLE_CLIENT_SECRET.trim(),
    }),
  );
}

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        if (
          !isVerifiedGoogleSignIn(
            account.provider,
            user.email,
            profile as Record<string, unknown> | undefined,
          )
        ) {
          return false;
        }
        const email = user.email!.trim().toLowerCase();
        const dbUser = await prisma.user.upsert({
          where: { email },
          update: {
            name: user.name || email.split("@")[0],
          },
          create: {
            email,
            name: user.name || email.split("@")[0],
            role: "DINER",
            locale: "en",
          },
        });
        if (!dbUser.isActive) return false;
        user.id = dbUser.id;
        user.role = dbUser.role;
        user.locale = isLocale(dbUser.locale) ? dbUser.locale : "en";
        user.isActive = dbUser.isActive;
      }
      return true;
    },
    async jwt({ token, user }) {
      return refreshJwtTokenClaims({
        token: token as RefreshableJwtToken,
        initialUser: user
          ? {
              id: user.id,
              role: user.role,
              locale: user.locale,
              isActive: user.isActive,
            }
          : undefined,
        loadUserById: (id) =>
          prisma.user.findUnique({
            where: { id },
            select: {
              id: true,
              role: true,
              locale: true,
              isActive: true,
              name: true,
              email: true,
            },
          }),
      });
    },
    async session({ session, token }) {
      if (!session.user || !token?.sub || token.isActive === false) {
        return { ...session, user: undefined as unknown as typeof session.user };
      }
      session.user.id = token.sub;
      session.user.role = (token.role as Role) ?? "DINER";
      session.user.locale = isLocale(token.locale as string) ? (token.locale as "en" | "ar") : "en";
      session.user.isActive = true;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}
