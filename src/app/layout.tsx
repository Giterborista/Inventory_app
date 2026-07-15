import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "LCI Builder | Guided research inventory workspace",
  description: "Guided life cycle inventory data collection for researchers without prior LCA expertise.",
};

export const viewport: Viewport = {
  themeColor: "#07141d",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
