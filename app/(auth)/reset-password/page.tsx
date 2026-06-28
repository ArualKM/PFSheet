import type { Metadata } from "next";
import { ResetRequestForm } from "@/components/auth/reset-request-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return <ResetRequestForm />;
}
