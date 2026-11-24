import { InboxView } from '@/features/chat/components/InboxView';

export const metadata = {
  title: 'Messages | Meguri',
  description: 'Chats between buyers and suppliers about surplus listings.',
};

export default function MessagesPage() {
  return <InboxView />;
}
