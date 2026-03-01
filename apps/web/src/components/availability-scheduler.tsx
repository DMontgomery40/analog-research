'use client'

import { useState, useCallback, useRef } from 'react'
import type { AvailabilitySchedule, TimeSlot } from '@analoglabor/database/types'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Time slots from 6am to midnight in 30-min increments
const TIME_SLOTS: string[] = []
for (let hour = 6; hour <= 23; hour++) {
  TIME_SLOTS.push(`${hour.toString().padStart(2, '0')}:00`)
  TIME_SLOTS.push(`${hour.toString().padStart(2, '0')}:30`)
}
TIME_SLOTS.push('24:00') // Represent midnight as end of day

interface AvailabilitySchedulerProps {
  value: AvailabilitySchedule
  onChange: (schedule: AvailabilitySchedule) => void
  readOnly?: boolean
}

export function AvailabilityScheduler({
  value,
  onChange,
  readOnly = false,
}: AvailabilitySchedulerProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ day: string; slot: number } | null>(null)
  const [dragEnd, setDragEnd] = useState<{ day: string; slot: number } | null>(null)
  const [dragMode, setDragMode] = useState<'add' | 'remove'>('add')
  const containerRef = useRef<HTMLDivElement>(null)

  const isSlotSelected = useCallback(
    (day: typeof DAYS[number], slotIndex: number): boolean => {
      const daySchedule = value[day] || []
      const slotTime = TIME_SLOTS[slotIndex]

      return daySchedule.some((slot) => {
        return slotTime >= slot.start && slotTime < slot.end
      })
    },
    [value]
  )

  const isSlotInDragRange = useCallback(
    (day: string, slotIndex: number): boolean => {
      if (!isDragging || !dragStart || !dragEnd) return false
      if (day !== dragStart.day) return false

      const minSlot = Math.min(dragStart.slot, dragEnd.slot)
      const maxSlot = Math.max(dragStart.slot, dragEnd.slot)
      return slotIndex >= minSlot && slotIndex <= maxSlot
    },
    [isDragging, dragStart, dragEnd]
  )

  const handleMouseDown = (day: typeof DAYS[number], slotIndex: number) => {
    if (readOnly) return
    const isSelected = isSlotSelected(day, slotIndex)
    setIsDragging(true)
    setDragStart({ day, slot: slotIndex })
    setDragEnd({ day, slot: slotIndex })
    setDragMode(isSelected ? 'remove' : 'add')
  }

  const handleMouseEnter = (day: string, slotIndex: number) => {
    if (!isDragging || !dragStart) return
    if (day !== dragStart.day) return
    setDragEnd({ day, slot: slotIndex })
  }

  const handleMouseUp = () => {
    if (!isDragging || !dragStart || !dragEnd) {
      setIsDragging(false)
      return
    }

    const day = dragStart.day as typeof DAYS[number]
    const minSlot = Math.min(dragStart.slot, dragEnd.slot)
    const maxSlot = Math.max(dragStart.slot, dragEnd.slot)

    const startTime = TIME_SLOTS[minSlot]
    const endTime = maxSlot + 1 < TIME_SLOTS.length ? TIME_SLOTS[maxSlot + 1] : '24:00'

    const newSchedule = { ...value }
    const daySchedule = [...(newSchedule[day] || [])]

    if (dragMode === 'add') {
      // Add new time slot
      const newSlot: TimeSlot = { start: startTime, end: endTime }
      daySchedule.push(newSlot)

      // Merge overlapping slots
      daySchedule.sort((a, b) => a.start.localeCompare(b.start))
      const merged: TimeSlot[] = []
      for (const slot of daySchedule) {
        if (merged.length === 0) {
          merged.push({ ...slot })
        } else {
          const last = merged[merged.length - 1]
          if (slot.start <= last.end) {
            last.end = slot.end > last.end ? slot.end : last.end
          } else {
            merged.push({ ...slot })
          }
        }
      }
      newSchedule[day] = merged
    } else {
      // Remove time slot
      const removeStart = startTime
      const removeEnd = endTime

      const updated: TimeSlot[] = []
      for (const slot of daySchedule) {
        if (slot.end <= removeStart || slot.start >= removeEnd) {
          // No overlap
          updated.push(slot)
        } else if (slot.start < removeStart && slot.end > removeEnd) {
          // Split the slot
          updated.push({ start: slot.start, end: removeStart })
          updated.push({ start: removeEnd, end: slot.end })
        } else if (slot.start < removeStart) {
          // Trim end
          updated.push({ start: slot.start, end: removeStart })
        } else if (slot.end > removeEnd) {
          // Trim start
          updated.push({ start: removeEnd, end: slot.end })
        }
        // Else: fully contained, remove it
      }
      newSchedule[day] = updated
    }

    onChange(newSchedule)
    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
  }

  return (
    <div
      ref={containerRef}
      className="select-none"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="text-sm text-muted-foreground mb-4">
        Click and drag to set your available hours
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Header */}
          <div className="grid grid-cols-8 gap-1 mb-2">
            <div className="text-sm text-muted-foreground"></div>
            {DAY_LABELS.map((day) => (
              <div key={day} className="text-center text-sm font-medium">
                {day}
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div className="space-y-px">
            {TIME_SLOTS.map((time, slotIndex) => (
              <div key={time} className="grid grid-cols-8 gap-1">
                <div className="text-xs text-muted-foreground flex items-center justify-end pr-2">
                  {slotIndex % 2 === 0 ? formatTime(time) : ''}
                </div>
                {DAYS.map((day) => {
                  const isSelected = isSlotSelected(day, slotIndex)
                  const isInDragRange = isSlotInDragRange(day, slotIndex)

                  let bgColor = 'bg-muted/30'
                  if (isInDragRange) {
                    bgColor = dragMode === 'add' ? 'bg-primary/50' : 'bg-destructive/50'
                  } else if (isSelected) {
                    bgColor = 'bg-primary'
                  }

                  return (
                    <div
                      key={`${day}-${slotIndex}`}
                      className={`h-4 rounded-sm cursor-pointer transition-colors ${bgColor} hover:opacity-80`}
                      onMouseDown={() => handleMouseDown(day, slotIndex)}
                      onMouseEnter={() => handleMouseEnter(day, slotIndex)}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-primary rounded-sm"></div>
          <span className="text-muted-foreground">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-muted/30 rounded-sm"></div>
          <span className="text-muted-foreground">Unavailable</span>
        </div>
      </div>
    </div>
  )
}

function formatTime(time: string): string {
  const [hours] = time.split(':')
  const hour = parseInt(hours)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${hour12}${ampm}`
}
