"use client";

import * as React from "react";
import { Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";

export function LanguageToggle() {
  const { locale, setLocale } = useI18n();
  const next = locale === "en" ? "ar" : "en";
  const label = locale === "en" ? "العربية" : "English";
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 px-2 sm:px-3"
      onClick={() => setLocale(next)}
      title={label}
      aria-label={label}
    >
      <Globe className="h-4 w-4" />
      <span className="hidden text-xs font-medium sm:inline">{label}</span>
    </Button>
  );
}
