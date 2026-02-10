import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { connectToDatabase } from '@/lib/db/mongoose';
import { ChatHistory } from '@/lib/models/ChatHistory';

cloudinary.config({
  cloud_name:"dsjmgwsoa",
  api_key: process.env.CLOUDINARY_API_KEY || "963731634497177",  
  api_secret: "x65U3OWaCwmsz4XxJSgTHerMyVM"
});

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer qara9821`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToDatabase();

    // Calculate 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Find media files older than 7 days that haven't been deleted from Cloudinary
    const oldMedia = await ChatHistory.find({
      type: { $in: ['image', 'voice'] },
      timestamp: { $lt: sevenDaysAgo },
      cloudinaryPublicId: { $exists: true, $ne: null },
      cloudinaryDeletedAt: { $exists: false }, // Not yet deleted
    }).limit(100); // Process in batches

    let deletedCount = 0;
    let failedCount = 0;

    for (const media of oldMedia) {
      try {
        // Delete from Cloudinary
        await cloudinary.uploader.destroy(media.cloudinaryPublicId, {
          resource_type: media.cloudinaryResourceType || 'image',
        });

        // Mark as deleted in MongoDB
        media.cloudinaryDeletedAt = new Date();
        await media.save();

        deletedCount++;
      } catch (err) {
        console.error(`Failed to delete ${media.cloudinaryPublicId}:`, err);
        failedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      failed: failedCount,
      checked: oldMedia.length,
      cutoffDate: sevenDaysAgo.toISOString(),
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json(
      { error: 'Cleanup failed' }, 
      { status: 500 }
    );
  }
}