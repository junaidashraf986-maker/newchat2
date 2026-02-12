
import { ChatHistory } from '@/lib/models/ChatHistory';
import { connectToDatabase } from '@/lib/db/mongoose';
import AdminNotification from '@/lib/models/AdminNotification';
import { PushSubscription } from '@/lib/models/PushSubscription';
import { Chatbot } from '@/lib/models/Chatbot';
import { sendPushNotification } from '@/lib/pushNotify';

export async function POST() {
  await connectToDatabase();

  // Find all unsent notifications that are due
  const now = new Date();
  const notifications = await AdminNotification.find({
    sent: false,
    scheduledFor: { $lte: now },
  });

  console.log(`[NotifyAdmin] Processing ${notifications.length} due notifications at ${now.toISOString()}`);

  for (const notif of notifications) {
    console.log(`[NotifyAdmin] Processing notification for session ${notif.sessionId}, chatbot ${notif.chatbotToken}`);
    // Check if admin has replied since notification was scheduled
    const adminReply = await ChatHistory.findOne({
      sessionId: notif.sessionId,
      chatbotToken: notif.chatbotToken,
      messageBy: "admin",
      timestamp: { $gt: notif.scheduledFor },
    });
    if (adminReply) {
      console.log(`[NotifyAdmin] Admin already replied for session ${notif.sessionId}, marking as sent.`);
      notif.sent = true;
      await notif.save();
      continue;
    }

    // Send notification to all push subscribers
    const subscriptions = await PushSubscription.find({});
    const chatbot = await Chatbot.findOne({ token: notif.chatbotToken }).select("_id");
    const chatbotId = chatbot ? chatbot._id.toString() : notif.chatbotToken;
    console.log(`[NotifyAdmin] Sending push notification to ${subscriptions.length} subscribers for session ${notif.sessionId}`);
    for (const sub of subscriptions) {
      try {
        await sendPushNotification({ endpoint: sub.endpoint, keys: sub.keys }, {
          title: "Mchatly: User waiting",
          body: "A user is waiting for a reply.",
          tag: notif.sessionId,
          data: {
            url: `/dashboard/chatbots/${chatbotId}/live-chats?session=${notif.sessionId}`,
          },
        });
        console.log(`[NotifyAdmin] Push notification sent to subscriber ${sub.endpoint}`);
      } catch (error: any) {
        console.error(`[NotifyAdmin] Failed to send push notification to ${sub.endpoint}:`, error?.message || error);
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
          console.log(`[NotifyAdmin] Removed invalid push subscription ${sub.endpoint}`);
        }
      }
    }
    notif.sent = true;
    await notif.save();
    console.log(`[NotifyAdmin] Notification marked as sent for session ${notif.sessionId}`);
  }

  return Response.json({ processed: notifications.length });
}

