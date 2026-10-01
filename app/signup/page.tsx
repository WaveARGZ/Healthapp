import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = { title: "新規登録 | BodyMake" };

export default function SignupPage() { return <AuthPage mode="signup" />; }
