"use client";

// Left navigation rail for the app shell; highlights the active route.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Avatar } from "./ui";
import { signOutAction } from "@/lib/auth-actions";
import { isAdminRole } from "@/lib/roles";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "◆" },
  { href: "/board", label: "Board", icon: "▤" },
  { href: "/projects", label: "Projects", icon: "▣" },
  { href: "/analytics", label: "Analytics", icon: "▦" },
  { href: "/templates", label: "Templates", icon: "❒" },
  { href: "/account", label: "Account", icon: "☺" },
];

// Admin/owner-only navigation.
const ADMIN_NAV = [
  { href: "/members", label: "Members", icon: "♟" },
  { href: "/agents", label: "Agents", icon: "✦" },
  { href: "/webhooks", label: "Webhooks", icon: "⇄" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function AppSidebar({
  user,
  role,
}: {
  user?: { name: string; email: string };
  role?: string | null;
}) {
  const pathname = usePathname();
  const nav = isAdminRole(role) ? [...NAV, ...ADMIN_NAV] : NAV;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white">
      <Link href="/" className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">
          Q
        </span>
        <span className="text-lg font-bold tracking-tight text-gray-900">QuestVault</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-brand-50 text-brand-600"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <span className="w-4 text-center text-xs">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-100 p-3">
        {user ? (
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Avatar name={user.name} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-medium text-gray-800">{user.name}</p>
                {(role === "admin" || role === "owner") && (
                  <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-600">
                    {role}
                  </span>
                )}
              </div>
              {user.email && (
                <p className="truncate text-xs text-gray-400">{user.email}</p>
              )}
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                title="Sign out"
                className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
              >
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <p className="px-2 text-xs text-gray-400">Dev workspace · localhost</p>
        )}
      </div>
    </aside>
  );
}
