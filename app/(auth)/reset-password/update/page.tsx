import type { Metadata } from "next";
import { ResetUpdateForm } from "@/components/auth/reset-update-form";

export const metadata: Metadata = { title: "Set new password" };

export default function ResetPasswordUpdatePage() {
  return <ResetUpdateForm />;
}
