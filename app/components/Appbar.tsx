"use client";
import { Button } from "@/components/ui/button";
import { signIn, signOut, useSession } from "next-auth/react"

export function Appbar() {
    const session = useSession();
    return <div>
            
            <nav className="relative z-10 flex justify-between items-center px-8 py-4">
        <div className="text-2xl font-bold text-white">MusicVote</div>
        <div className="flex items-center gap-6">
          <a href="#" className="text-gray-300 hover:text-white transition">
            About
          </a>
          <a href="#" className="text-gray-300 hover:text-white transition">
            Support
          </a>
          {session.data?.user &&  <Button  variant="ghost" className="text-gray-300 hover:text-white" onClick={() => {signOut()}} >Logout</Button> }
          {!session.data?.user && <Button  variant="ghost" className="text-gray-300 hover:text-white" onClick={() => {signIn()}} >Login</Button> }
          <Button className="bg-white text-black hover:bg-gray-100">Start Free Trial</Button>
        </div>
      </nav>
       
    </div>
}