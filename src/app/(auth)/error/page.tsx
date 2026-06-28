"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const ERROR_MESSAGES: Record<string, string> = {
  Configuration: "There is a problem with the server configuration.",
  AccessDenied: "You do not have permission to sign in.",
  Verification: "The sign-in link has expired or has already been used.",
  OAuthSignin: "Error starting the OAuth sign-in flow.",
  OAuthCallback: "Error during the OAuth callback.",
  OAuthCreateAccount: "Could not create an OAuth account.",
  EmailCreateAccount: "Could not create an email account.",
  Callback: "Error during the sign-in callback.",
  OAuthAccountNotLinked:
    "This email is already registered with a different sign-in method.",
  Default: "An unexpected error occurred during sign in.",
};

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error") ?? "Default";
  const message = ERROR_MESSAGES[error] ?? ERROR_MESSAGES["Default"]!;

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center space-y-3">
        <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <AlertTriangle className="h-6 w-6 text-red-600" />
        </div>
        <CardTitle className="text-xl">Sign in failed</CardTitle>
      </CardHeader>
      <CardContent className="text-center">
        <p className="text-slate-600 text-sm">{message}</p>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        <Button asChild className="w-full">
          <Link href="/login">Try again</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/">Go home</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
