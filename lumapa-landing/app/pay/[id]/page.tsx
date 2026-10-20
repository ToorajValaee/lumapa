import { notFound } from 'next/navigation';
import { getPaymentSession } from '@/lib/paymentSessions';
import PaySessionClient from './PaySessionClient';

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getPaymentSession(id);
  if (!session) notFound();
  return <PaySessionClient session={session} />;
}
