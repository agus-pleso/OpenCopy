import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "OpenCopy",
    template: "%s · OpenCopy",
  },
  description:
    "Open-source agentic AI copywriter and localizer for marketing teams. Trained on your brand voice.",
  applicationName: "OpenCopy",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast:
                  "border border-[--color-border] bg-[--color-card] text-[--color-card-foreground]",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
