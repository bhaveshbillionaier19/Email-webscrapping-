import { Public_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

const bodyFont = Public_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
});

export const metadata = {
  title: "Creator Lead Agent",
  description: "Find business emails from YouTube creators using a Gemini-guided lead generation agent.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${headingFont.variable}`}>
        {children}
      </body>
    </html>
  );
}
