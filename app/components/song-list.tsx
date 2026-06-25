import { ChevronUp, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { QueueItem } from "../types/Music"

interface SongListProps {
  tracks: QueueItem[]
  onVote: (trackId: string, isUpvote: boolean) => void
}

export function SongList({ tracks, onVote }: SongListProps) {
  return (
    <div className="space-y-2">
      {tracks.map((track) => (
        <div key={track.id} className="flex items-center gap-3 p-2 bg-gray-800 rounded-lg">
          {/* <Image
            src={track.thumbnail || "/placeholder.svg"}
            alt={track.title}
            width={80}
            height={45}
            className="rounded"
          /> */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-white truncate">{track.title}</h3>
          </div>
          <div className="flex flex-col items-center">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onVote(track.id, true)}>
              <ChevronUp className="h-4 w-4" />
            </Button>
            <span className="text-xs text-gray-400">{track.votes}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onVote(track.id, false)}>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

