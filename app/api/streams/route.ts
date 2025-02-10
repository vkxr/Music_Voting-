import { prismaClient } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
//@ts-ignore
import youtubesearchapi from "youtube-search-api";

const YT_REGEX = /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+(&\S*)?$/;

const CreateSchema = z.object({
  creatorId: z.string(),
  url: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const data = CreateSchema.parse(await req.json());

    // Validate YouTube URL
    if (!YT_REGEX.test(data.url)) {
      return NextResponse.json(
        { message: "Wrong URL format" },
        { status: 400 }
      );
    }

    // Extract video ID safely
    const urlParams = new URLSearchParams(new URL(data.url).search);
    const extractedId = urlParams.get("v");

    if (!extractedId) {
      return NextResponse.json(
        { message: "Invalid YouTube URL" },
        { status: 400 }
      );
    }

    // Fetch video details
    const res = await youtubesearchapi.GetVideoDetails(extractedId);

    if (!res || !res.thumbnail || !res.thumbnail.thumbnails) {
      return NextResponse.json(
        { message: "Failed to fetch video details" },
        { status: 500 }
      );
    }

    // Extract thumbnails
    const thumbnails = res.thumbnail.thumbnails;
    if (thumbnails.length > 0) {
      thumbnails.sort((a: { width: number }, b: { width: number }) =>
        a.width - b.width
      );
    }

    // Store in database
    const stream = await prismaClient.stream.create({
      data: {
        userId: data.creatorId,
        url: data.url,
        extractedId,
        type: "Youtube",
        title: res.title ?? "Unknown Title",
        bigImage: thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : "",
        smallImg:
          thumbnails.length > 1
            ? thumbnails[thumbnails.length - 2].url
            : thumbnails.length > 0
            ? thumbnails[thumbnails.length - 1].url
            : "",
      },
    });

    return NextResponse.json(
      { message: "Stream added successfully", id: stream.id },
      { status: 201 }
    );
  } catch (e) {
    console.error("Error while adding a stream:", e);
    return NextResponse.json(
      { message: "Error while adding a stream" },
      { status: 500 }
    );
  }
}


export async function GET(req: NextRequest){
    const creatorId = req.nextUrl.searchParams.get("creatorId");
    const streams = await prismaClient.stream.findMany({
        where:{
            userId : creatorId ?? ""
        }
    })

    return NextResponse.json({
        streams
    })
    
}