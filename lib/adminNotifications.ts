
import { ChatHistory } from "@/lib/models/ChatHistory";
import { PushSubscription } from "@/lib/models/PushSubscription";
import { Chatbot } from "@/lib/models/Chatbot";
import { connectToDatabase } from "@/lib/db/mongoose";
import { sendPushNotification } from "@/lib/pushNotify";

const sessionTimers: Record<string, NodeJS.Timeout> = {};

export function scheduleAdminNotification(sessionId: string, chatbotToken: string) {
  // Clear existing timer if any
  if (sessionTimers[sessionId]) {
    clearTimeout(sessionTimers[sessionId]);
  }

  // Set timeout for 30 minutes
  sessionTimers[sessionId] = setTimeout(async () => {
    try {
      await connectToDatabase();
      
      // Check if admin has replied in the last 30 minutes (since schedule time)
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      const adminReply = await ChatHistory.findOne({
        sessionId,
        chatbotToken,
        messageBy: "admin",
        timestamp: { $gt: thirtyMinutesAgo },
      });

      if (!adminReply) {
        // No admin reply found, send notification
        console.log(`Sending notification for session ${sessionId} (10s elapsed)`);
        
        // Fetch all subscriptions
        const subscriptions = await PushSubscription.find({});
        console.log(`Found ${subscriptions.length} push subscriptions`);

      const chatbot = await Chatbot.findOne({ token: chatbotToken }).select("_id");
      const chatbotId = chatbot ? chatbot._id.toString() : chatbotToken;

        for (const sub of subscriptions) {
          try {
            await sendPushNotification({ 
              endpoint: sub.endpoint, 
              keys: sub.keys 
            }, {
              title: "Mchatly: User waiting",
              body: "A user is waiting for a reply.",
              tag: sessionId,
              data: {
                url: `/dashboard/chatbots/${chatbotId}/live-chats?session=${sessionId}`
              }
            });
          } catch (error: any) {
            console.error(`Failed to send notification to ${sub._id}:`, error?.statusCode);
            if (error?.statusCode === 404 || error?.statusCode === 410) {
              console.log(`Removing invalid subscription: ${sub._id}`);
              await PushSubscription.deleteOne({ _id: sub._id });
            }
          }
        }
      }
    } catch (err) {
      console.error("Error in admin notification timer:", err);
    } finally {
      delete sessionTimers[sessionId];
    }
  }, 30 * 60 * 1000); // 30 minutes
}
