// Same shape as backend/app/schemas/notification.py
export type NotificationKind =
  | 'ORDER_RECEIVED'
  | 'ITEM_ACCEPTED'
  | 'ITEM_DECLINED'
  | 'ORDER_RESERVED'
  | 'ORDER_COMPLETED'
  | 'ORDER_CANCELLED'
  | 'PAYMENT_RECEIVED';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  exchange_id: string;
  created_at: string;
  read: boolean;
}

export interface NotificationFeed {
  items: AppNotification[];
  unreadTotal: number;
}
