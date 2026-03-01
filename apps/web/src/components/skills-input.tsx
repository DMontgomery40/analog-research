'use client'

import { useState, KeyboardEvent } from 'react'
import { X } from 'lucide-react'

interface SkillsInputProps {
  value: string[]
  onChange: (skills: string[]) => void
  placeholder?: string
  suggestions?: string[]
}

const DEFAULT_SUGGESTIONS = [
  'qa-testing',
  'mobile-testing',
  'photography',
  'videography',
  'data-entry',
  'research',
  'transcription',
  'delivery',
  'errands',
  'mystery-shopping',
  'user-testing',
  'surveying',
  'audio-recording',
  'local-guide',
  'translation',
]

export function SkillsInput({
  value,
  onChange,
  placeholder = 'Add a skill...',
  suggestions = DEFAULT_SUGGESTIONS,
}: SkillsInputProps) {
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const filteredSuggestions = suggestions.filter(
    (s) => s.toLowerCase().includes(input.toLowerCase()) && !value.includes(s)
  )

  const addSkill = (skill: string) => {
    const normalized = skill.toLowerCase().trim().replace(/\s+/g, '-')
    if (normalized && !value.includes(normalized)) {
      onChange([...value, normalized])
    }
    setInput('')
    setShowSuggestions(false)
  }

  const removeSkill = (skill: string) => {
    onChange(value.filter((s) => s !== skill))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault()
      addSkill(input)
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeSkill(value[value.length - 1])
    }
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-2 p-3 bg-background border border-input rounded-md min-h-[44px]">
        {value.map((skill) => (
          <span
            key={skill}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-primary/10 text-primary rounded-full text-sm"
          >
            {skill}
            <button
              type="button"
              onClick={() => removeSkill(skill)}
              className="hover:bg-primary/20 rounded-full p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setShowSuggestions(true)
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm"
        />
      </div>

      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-auto">
          {filteredSuggestions.slice(0, 8).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
              onMouseDown={() => addSkill(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
