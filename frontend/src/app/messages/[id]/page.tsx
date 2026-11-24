import { ChatPage } from '@/features/chat/components/ChatPage';

export const metadata = {
  title: 'Chat | MONOLOOP',
};

export default function ConversationPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { as?: string | string[] };
}) {
  const as = typeof searchParams.as === 'string' ? searchParams.as : null;
  return <ChatPage conversationId={params.id} as={as} />;
}
