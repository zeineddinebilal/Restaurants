import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role?: Role;
    locale?: "en" | "ar";
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      locale: "en" | "ar";
    } & DefaultSession["user"];
  }
}
