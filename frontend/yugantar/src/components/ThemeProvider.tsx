import React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

interface ThemeProviderProps {
    children: React.ReactNode
    attribute?: string
    defaultTheme?: string
    enableSystem?: boolean
    disableTransitionOnChange?: boolean
    storageKey?: string
}

export function ThemeProvider({
    children,
    attribute = 'class',
    defaultTheme = 'system',
    enableSystem = true,
    disableTransitionOnChange = false,
    storageKey = 'theme',
}: ThemeProviderProps) {
    return (
        <NextThemesProvider
            attribute={attribute}
            defaultTheme={defaultTheme}
            enableSystem={enableSystem}
            disableTransitionOnChange={disableTransitionOnChange}
            storageKey={storageKey}
        >
            {children}
        </NextThemesProvider>
    )
}
