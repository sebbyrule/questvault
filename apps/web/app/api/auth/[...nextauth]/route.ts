// Auth.js route handler — serves /api/auth/* (sign-in, callback, session, …).
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
