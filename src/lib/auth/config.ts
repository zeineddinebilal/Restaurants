import type { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isLocale } from "@/lib/i18n/dictionaries";

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
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        const email = user.email.toLowerCase();
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
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role ?? "DINER";
        token.locale = user.locale ?? "en";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = (token.role as Role) ?? "DINER";
        session.user.locale = isLocale(token.locale as string)
          ? (token.locale as "en" | "ar")
          : "en";
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}
