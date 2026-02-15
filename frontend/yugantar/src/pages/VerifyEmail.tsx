import { useEffect, useState } from "react"
import { useLocation, useSearch } from "wouter"
import { CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ENV } from "@/config/env"
import yugantarLogo from "@/assets/yugantar_logo.svg"

type VerifyState = "loading" | "success" | "already" | "error"

export default function VerifyEmail() {
    const search = useSearch()
    const [, navigate] = useLocation()

    const [state, setState] = useState<VerifyState>("loading")
    const [message, setMessage] = useState("")

    useEffect(() => {
        const params = new URLSearchParams(search)
        const token = params.get("token")

        if (!token) {
            setState("error")
            setMessage("No verification token provided. Please check your email link.")
            return
        }

        const verify = async () => {
            try {
                const res = await fetch(
                    `${ENV.API_BASE}/auth/verify-email?token=${encodeURIComponent(token)}`,
                    { method: "POST" },
                )
                const data = await res.json()

                if (res.ok) {
                    if (data.msg?.toLowerCase().includes("already")) {
                        setState("already")
                        setMessage(data.msg)
                    } else {
                        setState("success")
                        setMessage(data.msg)
                    }
                } else {
                    setState("error")
                    setMessage(data.detail || "Email verification failed.")
                }
            } catch {
                setState("error")
                setMessage("Could not connect to the server. Please try again later.")
            }
        }

        verify()
    }, [search])

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
                <CardContent className="flex flex-col items-center gap-6 pt-8 pb-8 text-center">
                    {/* Logo */}
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm border">
                        <img src={yugantarLogo} alt="Yugantar" className="h-12 w-12" />
                    </div>

                    {state === "loading" && (
                        <>
                            <Loader2 className="h-12 w-12 animate-spin text-primary" />
                            <div>
                                <h1 className="text-lg font-semibold text-foreground">Verifying your email…</h1>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Please wait while we verify your email address.
                                </p>
                            </div>
                        </>
                    )}

                    {state === "success" && (
                        <>
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                                <CheckCircle2 className="h-8 w-8 text-success" />
                            </div>
                            <div>
                                <h1 className="text-lg font-semibold text-foreground">Email Verified!</h1>
                                <p className="mt-1 text-sm text-muted-foreground">{message}</p>
                            </div>
                            <Button className="mt-2 gap-2" onClick={() => navigate("/login")}>
                                Go to Sign In
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </>
                    )}

                    {state === "already" && (
                        <>
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-chart-2/10">
                                <CheckCircle2 className="h-8 w-8 text-chart-2" />
                            </div>
                            <div>
                                <h1 className="text-lg font-semibold text-foreground">Already Verified</h1>
                                <p className="mt-1 text-sm text-muted-foreground">{message}</p>
                            </div>
                            <Button className="mt-2 gap-2" onClick={() => navigate("/login")}>
                                Go to Sign In
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </>
                    )}

                    {state === "error" && (
                        <>
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                                <XCircle className="h-8 w-8 text-destructive" />
                            </div>
                            <div>
                                <h1 className="text-lg font-semibold text-foreground">Verification Failed</h1>
                                <p className="mt-1 text-sm text-muted-foreground">{message}</p>
                            </div>
                            <Button variant="outline" className="mt-2 gap-2" onClick={() => navigate("/login")}>
                                Go to Sign In
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
