"use client";

import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "@/context/auth-context";

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
