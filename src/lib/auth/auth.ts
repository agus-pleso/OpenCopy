import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
  credentials,
} from "@/db/schema";
import { ensureWorkspaceForUser } from "./workspace";

const devEnabled = process.env.DEV_AUTH_ENABLED === "true";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128),
});

const providers: NextAuthConfig["providers"] = [];

if (process.env.AUTH_RESEND_KEY) {
  providers.push(
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.EMAIL_FROM ?? "OpenCopy <onboarding@resend.dev>",
    }),
  );
}

if (devEnabled) {
  providers.push(
    Credentials({
      name: "Dev sign-in",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const existing = await db.query.users.findFirst({
          where: eq(users.email, email),
        });

        if (existing) {
          const cred = await db.query.credentials.findFirst({
            where: eq(credentials.userId, existing.id),
          });
          if (!cred) {
            // Self-serve upgrade for users created via magic-link before dev mode
            const passwordHash = await hash(password, 10);
            await db.insert(credentials).values({
              userId: existing.id,
              passwordHash,
            });
            return { id: existing.id, email: existing.email, name: existing.name };
          }
          const ok = await compare(password, cred.passwordHash);
          if (!ok) return null;
          return { id: existing.id, email: existing.email, name: existing.name };
        }

        // First-time dev sign-in: provision the user.
        const passwordHash = await hash(password, 10);
        const [user] = await db
          .insert(users)
          .values({ email, emailVerified: new Date() })
          .returning();
        await db.insert(credentials).values({ userId: user.id, passwordHash });
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  );
}

export const authConfig: NextAuthConfig = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // We use database sessions when only Resend is configured; for the
  // credentials provider Auth.js requires JWT sessions. Keep JWT to support
  // both consistently.
  session: { strategy: "jwt" },
  providers,
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.userId && session.user) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (!user?.id) return;
      await ensureWorkspaceForUser(user.id, user.email ?? null, user.name ?? null);
    },
  },
  trustHost: true,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
