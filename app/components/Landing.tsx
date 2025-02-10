"use client"

import { Button } from "@/components/ui/button"
import { Play, SkipBack, SkipForward, Heart, Share2, Shuffle, Repeat } from "lucide-react"
import Image from "next/image"
import { useState, useEffect } from "react"
import { Appbar } from "./Appbar"
import { Redirect } from "./Redirect"

export default function Landing() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [])

  return (
    <div className="min-h-screen bg-[#1a1a1a] overflow-hidden relative">
      {/* Particle effect overlay */}
      <div
        className="absolute inset-0 bg-[radial-gradient(circle,_rgba(255,215,140,0.1)_0%,_transparent_70%)]"
        style={{
          transform: `translate(${mousePosition.x * 0.02}px, ${mousePosition.y * 0.02}px)`,
        }}
      />

      {/* Navigation */}
       <Appbar/>
       <Redirect/>

      {/* Hero Section */}
      <main className="relative z-10 container mx-auto px-8 pt-20 pb-32">
        <div className="flex justify-between items-center">
          <div className="max-w-2xl">
            <h1 className="text-6xl font-bold text-white mb-6">Listen. Vote. Discover.</h1>
            <p className="text-xl text-gray-300 mb-8">
              Join the community where music meets democracy. Vote for your favorite tracks and influence what plays
              next.
            </p>
            <Button size="lg" className="bg-white text-black hover:bg-gray-100">
              Start Listening
            </Button>
          </div>

          {/* Floating Cards */}
          <div className="relative">
            {/* Main Player Card */}
            <div className="bg-black/80 backdrop-blur-lg rounded-xl p-6 w-[400px] shadow-2xl">
              <div className="flex items-start gap-4">
                <Image
                  src="/placeholder.svg?height=120&width=120"
                  width={120}
                  height={120}
                  alt="Album Cover"
                  className="rounded-lg"
                />
                <div className="flex-1">
                  <h3 className="text-white font-semibold">Currently Playing</h3>
                  <p className="text-gray-400 text-sm">Artist Name</p>
                  <div className="flex items-center gap-2 mt-4">
                    <Heart className="w-5 h-5 text-gray-400 hover:text-white cursor-pointer" />
                    <Share2 className="w-5 h-5 text-gray-400 hover:text-white cursor-pointer" />
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-4">
                <div className="h-1 bg-gray-700 rounded-full">
                  <div className="h-1 bg-white rounded-full w-1/3" />
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>1:23</span>
                  <span>3:45</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-6 mt-4">
                <Shuffle className="w-5 h-5 text-gray-400 hover:text-white cursor-pointer" />
                <SkipBack className="w-6 h-6 text-gray-400 hover:text-white cursor-pointer" />
                <Button size="icon" className="bg-white text-black hover:bg-gray-100 rounded-full h-10 w-10">
                  <Play className="w-5 h-5" />
                </Button>
                <SkipForward className="w-6 h-6 text-gray-400 hover:text-white cursor-pointer" />
                <Repeat className="w-5 h-5 text-gray-400 hover:text-white cursor-pointer" />
              </div>
            </div>

            {/* Floating Queue Card */}
            <div className="absolute -right-40 -top-20 bg-black/80 backdrop-blur-lg rounded-xl p-4 w-[300px] shadow-2xl">
              <h3 className="text-white font-semibold mb-3">Up Next</h3>
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <Image
                      src="/placeholder.svg?height=40&width=40"
                      width={40}
                      height={40}
                      alt="Album Cover"
                      className="rounded"
                    />
                    <div>
                      <p className="text-white text-sm">Song Name</p>
                      <p className="text-gray-400 text-xs">Artist Name</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating Vote Card */}
            <div className="absolute -left-40 -bottom-20 bg-black/80 backdrop-blur-lg rounded-xl p-4 w-[280px] shadow-2xl">
              <h3 className="text-white font-semibold mb-3">Top Voted</h3>
              <div className="space-y-3">
                {[1, 2].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <div className="text-gray-400 font-medium">{item}</div>
                    <Image
                      src="/placeholder.svg?height=40&width=40"
                      width={40}
                      height={40}
                      alt="Album Cover"
                      className="rounded"
                    />
                    <div className="flex-1">
                      <p className="text-white text-sm">Song Name</p>
                      <p className="text-gray-400 text-xs">Artist Name</p>
                    </div>
                    <div className="text-white font-medium">{item === 1 ? "234" : "187"}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

