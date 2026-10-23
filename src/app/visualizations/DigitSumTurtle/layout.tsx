import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "数位和海龟绘图",
  description: "n 进制数位和奇偶驱动的海龟作图：偶数前进画线，奇数旋转 360°/m",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
    {children}
    </>
  );
}
