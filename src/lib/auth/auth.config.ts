import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe NextAuth config. Used by `middleware.ts` to verify JWT sessions
 * without pulling in Node-only modules (pg, bcryptjs, drizzle adapter).
 *
 * The full config in `auth.ts` extends this with the database adapter and
 * provider authorize functions.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  providers: [],
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
  trustHost: true,
} satisfies NextAuthConfig;
