'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        setState('copied')
      } catch {
        setState('failed')
      }
    }
    setTimeout(() => setState('idle'), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className={className ?? 'absolute top-3 right-3 p-2 rounded-md bg-background/50 hover:bg-background/80 transition-colors'}
      aria-label={state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy to clipboard'}
    >
      {state === 'copied' ? (
        <Check className="w-4 h-4 text-green-500" />
      ) : state === 'failed' ? (
        <Copy className="w-4 h-4 text-destructive" />
      ) : (
        <Copy className="w-4 h-4 text-muted-foreground" />
      )}
    </button>
  )
}
