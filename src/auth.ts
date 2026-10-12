import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Nodemailer from "next-auth/providers/nodemailer";
import type {} from "next-auth/jwt"; // makes the JWT augmentation below resolvable
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/server/db/client";
import { verifyPassword } from "@/server/auth/password";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      organizationId: string;
      role: Role;
      locale: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    organizationId?: string;
    role?: Role;
    locale?: string;
  }
}

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

class InvalidCredentials extends CredentialsSignin {
  code = "invalid_credentials";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // JWT sessions: required for the Credentials provider and keep the proxy
  // check DB-free. The adapter is still used for magic-link tokens.
  session: { strategy: "jwt" },
  trustHost: true,
  logger: {
    // Wrong passwords and unknown magic-link emails are expected outcomes, not errors.
    error(error) {
      if (error instanceof CredentialsSignin || error.name === "AccessDenied") return;
      console.error("[auth]", error);
    },
  },
  pages: {
    signIn: "/ko/login",
    error: "/ko/login",
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) throw new InvalidCredentials();
        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user?.passwordHash) throw new InvalidCredentials();
        const ok = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!ok) throw new InvalidCredentials();
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    Nodemailer({
      server: process.env.EMAIL_SERVER ?? "smtp://localhost:1025",
      from: process.env.EMAIL_FROM ?? "StayTalk <no-reply@staytalk.local>",
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Magic links only for existing staff accounts: never self-signup.
      if (account?.provider === "nodemailer") {
        if (!user.email) return false;
        const existing = await prisma.user.findUnique({
          where: { email: user.email.toLowerCase() },
          select: { id: true },
        });
        return Boolean(existing);
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
        if (dbUser) {
          token.uid = dbUser.id;
          token.organizationId = dbUser.organizationId;
          token.role = dbUser.role;
          token.locale = dbUser.locale;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid && token.organizationId && token.role) {
        session.user.id = token.uid;
        session.user.organizationId = token.organizationId;
        session.user.role = token.role;
        session.user.locale = token.locale ?? "ko";
      }
      return session;
    },
  },
});
