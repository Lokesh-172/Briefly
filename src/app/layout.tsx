import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn, constructMetadata } from "@/lib/utils";
import Navbar from "@/components/Navbar";
import Provider from "@/components/Provider";
import 'react-loading-skeleton/dist/skeleton.css';
import { Toaster } from "sonner";
import "simplebar-react/dist/simplebar.min.css"

const inter = Inter({subsets : ['latin']})

export const metadata: Metadata = constructMetadata()

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light">
      <Provider>
      <body className={cn("min-h-screen font-sans antialiased grainy",
        inter.className
      )}>
        <Toaster/>
        <Navbar/>
        {children}
      </body>
      </Provider>
    </html>
  );
}
