"use client"

import { Button } from "@/components/ui/button"
import { Play } from "lucide-react"
import type { Track } from "../types/Music"

interface YouTubePlayerProps {
  currentTrack: Track | null
  onPlayNext: () => void
}

export function YouTubePlayer({ currentTrack, onPlayNext }: YouTubePlayerProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Now Playing</h2>
      <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden">
        {currentTrack?.youtubeUrl ? (
          <iframe
            src={`https://www.youtube.com/embed/${currentTrack.youtubeUrl}?autoplay=1`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">No track selected</div>
        )}
      </div>
      <Button className="w-full" onClick={onPlayNext}>
        <Play className="w-4 h-4 mr-2" />
        Play next
      </Button>
    </div>
  )
}

