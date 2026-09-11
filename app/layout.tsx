import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agente de Classificação Fiscal por NCM',
  description:
    'Classificação de produtos por NCM sobre a Tabela NCM vigente do Portal Único Siscomex, com RGI, Notas Legais, IPI/II, CEST e parametrização de documento fiscal.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
