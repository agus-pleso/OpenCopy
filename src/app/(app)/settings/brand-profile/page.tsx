import { ScanText, MessageSquareQuote, Languages, Cookie } from "lucide-react";

import {
  getBrandProfile,
  listCookieProfiles,
} from "@/server/actions/brand-profile";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CookieProfileForm } from "@/components/brand-profile/cookie-profile-form";
import { LocalesEditor } from "./locales-editor";
import { DeepDiveButtons } from "./deep-dive-buttons";

export default async function BrandProfileSettingsPage() {
  const [profile, cookieProfiles] = await Promise.all([
    getBrandProfile(),
    listCookieProfiles(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Locales</CardTitle>
              <CardDescription>
                Which markets you operate in. Voice and audience are captured per-locale.
              </CardDescription>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <ScanText className="h-4 w-4" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <LocalesEditor initial={profile?.locales ?? ["en"]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Tool deep-dives</CardTitle>
              <CardDescription>
                Short chats that capture the extra context the SEO and Localizer
                agents need.
              </CardDescription>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <MessageSquareQuote className="h-4 w-4" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DeepDiveButtons availableLocales={profile?.locales ?? ["en"]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Crawler cookies (BYOK)</CardTitle>
              <CardDescription>
                Save login cookies for crawling private pages. Stored AES-encrypted;
                only the last 4 characters are ever shown.
              </CardDescription>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <Cookie className="h-4 w-4" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <CookieProfileForm profiles={cookieProfiles} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Localizer settings</CardTitle>
              <CardDescription>
                Per-locale formality + idiom rules surface here once the Localizer
                deep-dive runs.
              </CardDescription>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <Languages className="h-4 w-4" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
            <span>Coming after the first localizer deep-dive completes.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
