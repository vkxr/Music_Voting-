import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MusicIcon, TrendingUpIcon, UsersIcon, VoteIcon } from "lucide-react"
import { Appbar } from "./components/Appbar"
import Landing from "./components/Landing"

export default function Home() {
  return (
    <div>
      <Landing/>
    </div>
  )
}

