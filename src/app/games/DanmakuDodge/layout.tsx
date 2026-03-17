import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "弹幕躲避",
  description: "简约弹幕躲避生存游戏",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
