// Shell layout for the `(app)` route group (board / dashboard / projects). The
// route group keeps these pages' URLs flat (/board, not /app/board) while sharing
// the sidebar and the globally-available AI coach panel.
import { AppSidebar } from "@/components/app-sidebar";
import { CoachPanel } from "@/components/coach-panel";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <CoachPanel />
    </div>
  );
}
