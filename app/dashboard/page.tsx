"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { YouTubePlayer } from "../components/youtube.player"
import { SongList } from "../components/song-list"
import type { Track } from "../types/Music"
import { Appbar } from "../components/Appbar"
import axios from "axios"
import { useSession } from "next-auth/react"

function extractVideoId(url: string) {

    const regex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
    const match = url.match(regex)
    return match ? match[1] : null
}



export default function Home() {
    const session = useSession();

    async function fetchStreams() {

        const response = await fetch("/api/streams/my", {
            credentials: "include"
        });
        const data = await response.json()
    }

    useEffect(() => {
        setInterval(() => {
            fetchStreams();
        }, 10000);
    }, [])
    const [youtubeUrl, setYoutubeUrl] = useState("")
    const [tracks, setTracks] = useState<Track[]>([
        {
            id: "1",
            title: "He Got a Rs 50k/month Internship in a US-based remote startup.",
            thumbnail:
                "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Screenshot%202025-02-09%20214100-QYR5hdzCxcdjDfUt5r2HIeINMIw0m1.png",
            votes: 1,
            youtubeUrl: "dQw4w9WgXcQ",
        },
        {
            id: "2",
            title: "Roasting Pakistani During a Fire",
            thumbnail:
                "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Screenshot%202025-02-09%20214100-QYR5hdzCxcdjDfUt5r2HIeINMIw0m1.png",
            votes: 1,
            youtubeUrl: "dQw4w9WgXcQ",
        },
    ])
    const [currentTrack, setCurrentTrack] = useState<Track | null>(null)

    const handleAddTrack = () => {
        const videoId = extractVideoId(youtubeUrl)
        if (videoId) {
            const newTrack: Track = {
                id: Date.now().toString(),
                title: "New Track",
                thumbnail: `/placeholder.svg`,
                votes: 0,
                youtubeUrl: videoId,
            }
            setTracks([...tracks, newTrack])
            setYoutubeUrl("")
        }
    }

    const handleVote = (trackId: string, isUpvote: boolean) => {
        setTracks(
            tracks.map((track) => {
                if (track.id === trackId) {
                    return {
                        ...track,
                        votes: track.votes + (isUpvote ? 1 : -1),
                    }
                }
                return track
            }),
        )
    }

    const handlePlayNext = () => {
        const sortedTracks = [...tracks].sort((a, b) => b.votes - a.votes)
        if (sortedTracks.length > 0) {
            setCurrentTrack(sortedTracks[0])
            setTracks(tracks.filter((track) => track.id !== sortedTracks[0].id))
        }
    }

    return (
        <div className="min-h-screen bg-black text-white">
            <Appbar />
            <main className="container py-6">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr,400px] gap-6">
                    <div>
                        <h2 className="text-xl font-semibold mb-4">Upcoming Songs</h2>
                        <div className="h-[calc(100vh-200px)] overflow-y-auto pr-4">
                            <SongList tracks={[...tracks].sort((a, b) => b.votes - a.votes)} onVote={handleVote} />
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-xl font-semibold mb-4">Add a song</h2>
                            <div className="flex flex-col gap-2">
                                <Input
                                    type="text"
                                    placeholder="Paste YouTube link here"
                                    value={youtubeUrl}
                                    onChange={(e) => setYoutubeUrl(e.target.value)}
                                />
                                <Button onClick={handleAddTrack} className="w-full">
                                    Add to Queue
                                </Button>
                            </div>
                        </div>
                        <YouTubePlayer currentTrack={currentTrack} onPlayNext={handlePlayNext} />
                    </div>
                </div>
            </main>
        </div>
    )
}

