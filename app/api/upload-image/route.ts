import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name:"dsjmgwsoa",
  api_key: process.env.CLOUDINARY_API_KEY || "963731634497177",  
  api_secret: "x65U3OWaCwmsz4XxJSgTHerMyVM"
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const resourceType = (formData.get('resourceType') as string) || 'image';
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const dataURI = `data:${file.type};base64,${base64}`;

    // Upload to Cloudinary with appropriate resource type
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'mchatly',
      resource_type: resourceType === 'video' ? 'video' : 'auto',
    });

    return NextResponse.json({ 
  url: result.secure_url,
  public_id: result.public_id,  
  resource_type: result.resource_type,
});
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' }, 
      { status: 500 }
    );
  }
}