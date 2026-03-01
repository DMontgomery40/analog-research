'use client'

import { CopyButton } from '@/components/copy-button'

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  return (
    <div className="relative">
      <pre className={`bg-muted p-4 rounded-lg overflow-x-auto text-sm ${language ? `language-${language}` : ''}`}>
        <code>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  )
}
