/**
 * Registration page (server) — first-run admin setup only. Once any real user
 * exists, registration is closed: redirect to login.
 */
import { redirect } from "next/navigation";
import { adminExists } from "@/lib/queries";
import { RegisterForm } from "@/components/auth/register-form";

export default async function RegisterPage() {
  if (await adminExists()) redirect("/auth/login");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-brand-600 tracking-tight">QuestVault</h1>
          <p className="mt-1 text-sm text-gray-500">Gamified project management</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <RegisterForm />
        </div>
      </div>
    </div>
  );
}
