import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Polymarket Arbitrage | 套利系统',
    template: '%s | Polymarket Arbitrage',
  },
  description:
    'Polymarket 套利回测与实盘交易系统。支持策略优化、实时流式回测及实盘自动化交易。',
  keywords: [
    'Polymarket',
    'Arbitrage',
    'Prediction Market',
    'Trading',
    'Backtesting',
    'Strategy',
  ],
  authors: [{ name: 'Polymarket Arbitrage Team' }],
  openGraph: {
    title: 'Polymarket Arbitrage | 套利系统',
    description:
      'Polymarket 套利回测与实盘交易系统。支持策略优化、实时流式回测及实盘自动化交易。',
    siteName: 'Polymarket Arbitrage',
    locale: 'zh_CN',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
