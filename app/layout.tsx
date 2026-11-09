import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-display" });
const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Bisco Tracker",
  description: "Log the Disco Biscuits shows you've been to and see every song, segue and gap you've caught.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        {children}
        <footer>
          <div className="wrap">
            Shows and setlists from the{" "}
            <a href="https://discobiscuits.net" target="_blank" rel="noopener">Bisco Internet Project</a>. An unofficial fan project, not
            affiliated with The Disco Biscuits.
          </div>
        </footer>
      </body>
    </html>
  );
}
